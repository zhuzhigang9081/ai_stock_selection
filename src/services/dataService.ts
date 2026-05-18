import axios from 'axios';
import { execFile } from 'child_process';
import iconv from 'iconv-lite';
import http from 'http';
import https from 'https';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

type DataSourceTier = 'primary' | 'fallback' | 'cache';
type DataQualityLevel = 'high' | 'medium' | 'low';

export interface DataQualityMeta {
  source: string;
  endpoint: string;
  tier: DataSourceTier;
  fetchedAt: string;
  asOf?: string;
  cacheHit: boolean;
  stale: boolean;
  isEstimated: boolean;
  qualityScore: number;
  qualityLevel: DataQualityLevel;
  issues: string[];
}

interface RequestResult<T> {
  data: T;
  asOf?: string;
  issues?: string[];
  isEstimated?: boolean;
}

interface PublicRequestOptions<T> {
  cacheKey: string;
  endpoint: string;
  source: string;
  cacheTtlMs: number;
  staleTtlMs?: number;
  requestFn: () => Promise<RequestResult<T>>;
  fallbackFn?: () => Promise<RequestResult<T>>;
}

interface CacheEntry<T> {
  value: T;
  meta: DataQualityMeta;
  expiresAt: number;
  staleUntil: number;
}

const requestCache = new Map<string, CacheEntry<unknown>>();

const CACHE_TTLS = {
  snapshot: 20 * 1000,
  history: 10 * 60 * 1000,
  sector: 6 * 60 * 60 * 1000,
  industryRank: 2 * 60 * 1000,
  financial: 12 * 60 * 60 * 1000,
  fundFlow: 2 * 60 * 1000,
} as const;

const PYTHON_BRIDGE_BIN =
  process.env.TUSHARE_PYTHON || '/Users/zhuzhigang/.agents/skills/股票分析/venv/bin/python';
const TUSHARE_PYTHON = PYTHON_BRIDGE_BIN;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TUSHARE_BRIDGE = path.join(PROJECT_ROOT, 'scripts', 'tushare_bridge.py');

const EASTMONEY_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  Referer: 'http://quote.eastmoney.com/',
  Connection: 'close',
};

function createEastMoneyAxiosConfig(params?: Record<string, unknown>) {
  return {
    params,
    headers: EASTMONEY_HEADERS,
    httpAgent: new http.Agent({ keepAlive: false }),
    httpsAgent: new https.Agent({ keepAlive: false }),
    timeout: 5000,
    family: 4 as const,
  };
}

function toHttpsFirstEastMoneyUrls(url: string): string[] {
  if (url.startsWith('https://')) return [url, url.replace(/^https:/, 'http:')];
  if (url.startsWith('http://')) return [url.replace(/^http:/, 'https:'), url];
  return [url];
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: string }).code || '') : '';
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'].includes(code);
}

async function requestEastMoney(url: string, params?: Record<string, unknown>) {
  const urls = toHttpsFirstEastMoneyUrls(url);
  let lastError: unknown = null;

  for (const candidate of urls) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await axios.get(candidate, createEastMoneyAxiosConfig(params));
      } catch (error) {
        lastError = error;
        if (!isRetryableNetworkError(error)) {
          throw error;
        }
      }
    }
  }

  throw lastError;
}

function toSecid(symbol: string): string {
  if (symbol.endsWith('.SZ')) return `0.${symbol.replace('.SZ', '')}`;
  if (symbol.endsWith('.SH')) return `1.${symbol.replace('.SH', '')}`;
  return '';
}

function toMarketCode(symbol: string): 'sz' | 'sh' | null {
  if (symbol.endsWith('.SZ')) return 'sz';
  if (symbol.endsWith('.SH')) return 'sh';
  return null;
}

function toPlainCode(symbol: string): string {
  return symbol.replace(/\.(SZ|SH)$/, '');
}

async function runTushareBridge<T>(command: string, payload: Record<string, unknown>): Promise<RequestResult<T>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { stdout, stderr } = await execFileAsync(
        TUSHARE_PYTHON,
        [TUSHARE_BRIDGE, command, JSON.stringify(payload)],
        { maxBuffer: 1024 * 1024 * 8 }
      );

      const raw = stdout.trim();
      if (!raw) {
        throw new Error(`Tushare bridge empty stdout${stderr ? `: ${stderr.trim()}` : ''}`);
      }

      const parsed = JSON.parse(raw);
      if (!parsed.ok) {
        throw new Error(parsed.error || 'Tushare bridge failed');
      }

      return {
        data: parsed.data as T,
        asOf: parsed.asOf,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        isEstimated: Boolean(parsed.isEstimated),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError && typeof lastError === 'object') {
    const execError = lastError as {
      message?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const stdoutText = execError.stdout ? String(execError.stdout).trim() : '';
    const stderrText = execError.stderr ? String(execError.stderr).trim() : '';
    throw new Error(
      [
        execError.message || 'Tushare bridge failed',
        stderrText ? `stderr: ${stderrText}` : '',
        stdoutText ? `stdout: ${stdoutText}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    );
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function formatBridgeDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = String(value).trim();
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  }
  return normalized;
}

function computeQualityLevel(score: number): DataQualityLevel {
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  return 'low';
}

function dedupeIssues(issues: string[]): string[] {
  return [...new Set(issues.filter(Boolean))];
}

function createMeta(params: {
  source: string;
  endpoint: string;
  tier: DataSourceTier;
  asOf?: string;
  cacheHit?: boolean;
  stale?: boolean;
  isEstimated?: boolean;
  issues?: string[];
}): DataQualityMeta {
  const issues = dedupeIssues(params.issues || []);
  let qualityScore = 96;

  if (params.tier === 'fallback') qualityScore -= 10;
  if (params.tier === 'cache') qualityScore -= params.stale ? 18 : 6;
  if (params.isEstimated) qualityScore -= 20;
  if (params.stale) qualityScore -= 10;
  qualityScore -= Math.min(issues.length * 7, 28);

  const normalizedScore = Math.max(25, Math.min(99, qualityScore));

  return {
    source: params.source,
    endpoint: params.endpoint,
    tier: params.tier,
    fetchedAt: new Date().toISOString(),
    asOf: params.asOf,
    cacheHit: params.cacheHit ?? false,
    stale: params.stale ?? false,
    isEstimated: params.isEstimated ?? false,
    qualityScore: normalizedScore,
    qualityLevel: computeQualityLevel(normalizedScore),
    issues,
  };
}

function getCachedEntry<T>(cacheKey: string, includeStale: boolean): CacheEntry<T> | null {
  const entry = requestCache.get(cacheKey) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const now = Date.now();
  if (entry.expiresAt > now) {
    return entry;
  }

  if (includeStale && entry.staleUntil > now) {
    return entry;
  }

  requestCache.delete(cacheKey);
  return null;
}

function setCachedEntry<T>(
  cacheKey: string,
  value: T,
  meta: DataQualityMeta,
  cacheTtlMs: number,
  staleTtlMs: number
) {
  const now = Date.now();
  requestCache.set(cacheKey, {
    value,
    meta,
    expiresAt: now + cacheTtlMs,
    staleUntil: now + cacheTtlMs + staleTtlMs,
  });
}

async function fetchWithPublicApiResilience<T>(options: PublicRequestOptions<T>): Promise<{ data: T; meta: DataQualityMeta }> {
  const freshCache = getCachedEntry<T>(options.cacheKey, false);
  if (freshCache) {
    return {
      data: freshCache.value,
      meta: createMeta({
        source: freshCache.meta.source,
        endpoint: freshCache.meta.endpoint,
        tier: 'cache',
        asOf: freshCache.meta.asOf,
        cacheHit: true,
        stale: false,
        isEstimated: freshCache.meta.isEstimated,
        issues: [...freshCache.meta.issues, '使用内存缓存结果，减少公开接口波动影响'],
      }),
    };
  }

  try {
    const result = await options.requestFn();
    const meta = createMeta({
      source: options.source,
      endpoint: options.endpoint,
      tier: 'primary',
      asOf: result.asOf,
      isEstimated: result.isEstimated,
      issues: result.issues,
    });
    setCachedEntry(
      options.cacheKey,
      result.data,
      meta,
      options.cacheTtlMs,
      options.staleTtlMs ?? options.cacheTtlMs * 3
    );
    return { data: result.data, meta };
  } catch (primaryError) {
    const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);

    if (options.fallbackFn) {
      try {
        const fallbackResult = await options.fallbackFn();
        const meta = createMeta({
          source: options.source,
          endpoint: options.endpoint,
          tier: 'fallback',
          asOf: fallbackResult.asOf,
          isEstimated: fallbackResult.isEstimated,
          issues: [`主接口失败: ${primaryMessage}`, ...(fallbackResult.issues || [])],
        });
        setCachedEntry(
          options.cacheKey,
          fallbackResult.data,
          meta,
          options.cacheTtlMs,
          options.staleTtlMs ?? options.cacheTtlMs * 3
        );
        return { data: fallbackResult.data, meta };
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        const staleCache = getCachedEntry<T>(options.cacheKey, true);
        if (staleCache) {
          return {
            data: staleCache.value,
            meta: createMeta({
              source: staleCache.meta.source,
              endpoint: staleCache.meta.endpoint,
              tier: 'cache',
              asOf: staleCache.meta.asOf,
              cacheHit: true,
              stale: true,
              isEstimated: staleCache.meta.isEstimated,
              issues: [
                `主接口失败: ${primaryMessage}`,
                `回退接口失败: ${fallbackMessage}`,
                '使用过期缓存兜底，请谨慎看待时效性',
              ],
            }),
          };
        }
        throw new Error(`主接口失败: ${primaryMessage}; 回退接口失败: ${fallbackMessage}`);
      }
    }

    const staleCache = getCachedEntry<T>(options.cacheKey, true);
    if (staleCache) {
      return {
        data: staleCache.value,
        meta: createMeta({
          source: staleCache.meta.source,
          endpoint: staleCache.meta.endpoint,
          tier: 'cache',
          asOf: staleCache.meta.asOf,
          cacheHit: true,
          stale: true,
          isEstimated: staleCache.meta.isEstimated,
          issues: [`公开接口失败: ${primaryMessage}`, '使用过期缓存兜底，请谨慎看待时效性'],
        }),
      };
    }

    throw primaryError;
  }
}

// 定义数据接口（为了兼容性保持与之前一致）
export interface StockSnapshot {
  symbol: string;
  name?: string; // 新增名称字段
  price: number;
  changePercent: number;
  turnoverRate?: number; // 换手率
  volumeRatio?: number; // 量比
  marketSentiment?: string; // 市场情绪 (衍生字段)
  dataQuality?: DataQualityMeta;
}

export interface KlineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockHistory {
  symbol: string;
  klines: KlineData[];
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  atr14?: number | null;
  fibSupport?: number | null;
  rsi?: number | null;
  rsi6?: number | null;
  kdj?: { k: number, d: number, j: number } | null;
  macd?: { diff: number, dea: number, macd: number } | null;
  boll?: { upper: number, middle: number, lower: number } | null;
  volumeTrend?: string; // e.g. "放量", "缩量"
  ma5Slope?: number | null; // MA5 斜率 (角度)
  ma10Slope?: number | null;
  ma20Slope?: number | null;
  bias5?: number | null; // MA5 乖离率
  bias10?: number | null;
  bias60?: number | null;
  dataQuality?: DataQualityMeta;
}

export type AnalysisDataMode = 'postmarket';

// 辅助函数：转换格式 "000933.SZ" -> "sz000933"
function formatSymbolForTencent(symbol: string): string {
  const parts = symbol.split('.');
  if (parts.length === 2) {
    return parts[1].toLowerCase() + parts[0];
  }
  // 如果已经是 sh600519 格式或其他，直接返回
  return symbol.toLowerCase();
}

/**
 * 从腾讯 (qt.gtimg.cn) 获取股票快照
 */
function buildSnapshotFromTencentPayload(symbol: string, rawData: string): RequestResult<StockSnapshot> {
  const match = rawData.match(/="(.*)";/);
  if (!match || !match[1]) {
    if (rawData.includes('pv_none')) {
      throw new Error(`未找到股票 ${symbol}`);
    }
    throw new Error(`来自腾讯 API 的响应格式无效: ${rawData}`);
  }

  const values = match[1].split('~');
  const name = values[1];
  const currentPrice = parseFloat(values[3]);
  const changePercent = parseFloat(values[32]);
  const turnoverRate = Number.isFinite(parseFloat(values[38])) ? parseFloat(values[38]) : undefined;
  const volumeRatio = Number.isFinite(parseFloat(values[49])) ? parseFloat(values[49]) : undefined;

  if (!Number.isFinite(currentPrice)) {
    throw new Error(`快照现价字段无效: ${values[3]}`);
  }

  let marketSentiment = '震荡';
  if (changePercent > 1.5) marketSentiment = '多头';
  else if (changePercent < -1.5) marketSentiment = '空头';

  const issues: string[] = [];
  if (turnoverRate === undefined) issues.push('腾讯快照未返回换手率');
  if (volumeRatio === undefined) issues.push('腾讯快照未返回量比');

  return {
    data: {
      symbol,
      name,
      price: currentPrice,
      changePercent: Number.isFinite(changePercent) ? changePercent : 0,
      turnoverRate,
      volumeRatio,
      marketSentiment,
    },
    issues,
    asOf: new Date().toISOString().slice(0, 10),
  };
}

export async function fetchStockSnapshot(
  symbol: string,
  mode: AnalysisDataMode = 'postmarket'
): Promise<StockSnapshot> {
  const tencentSymbol = formatSymbolForTencent(symbol);
  const url = `http://qt.gtimg.cn/q=${tencentSymbol}`;
  try {
    const { data, meta } = await fetchWithPublicApiResilience<StockSnapshot>({
      cacheKey: `snapshot:${symbol}:${mode}`,
      endpoint: `tushare://snapshot/${symbol}`,
      source: 'Tushare snapshot bridge',
      cacheTtlMs: CACHE_TTLS.snapshot,
      requestFn: async () => {
        const result = await runTushareBridge<StockSnapshot>('snapshot', { symbol });
        return {
          data: {
            ...result.data,
            changePercent: Number(result.data.changePercent),
            price: Number(result.data.price),
          },
          issues: result.issues,
          asOf: formatBridgeDate(result.asOf),
          isEstimated: result.isEstimated,
        };
      },
      fallbackFn: async () => {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        return buildSnapshotFromTencentPayload(symbol, iconv.decode(response.data, 'gbk'));
      },
    });

    return {
      ...data,
      dataQuality: meta,
    };
  } catch (error) {
    console.error(`获取 ${symbol} 快照时出错:`, error);
    throw error;
  }
}

/**
 * 从腾讯 (web.ifzq.gtimg.cn) 获取股票历史 (K线)
 * 使用此端点是因为 qt.gtimg.cn/q= 仅提供快照。
 */
export async function fetchStockHistory(symbol: string): Promise<StockHistory> {
  const tencentSymbol = formatSymbolForTencent(symbol);
  // 参数格式: [code],day,,,[count],qfq
  // qfq = 前复权价格
  const count = 250; // 增加到250天以支持MA120和长期趋势判断
  const url = `http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentSymbol},day,,,${count},qfq`;

  try {
    const { data: history, meta } = await fetchWithPublicApiResilience<StockHistory>({
      cacheKey: `history:${symbol}`,
      endpoint: `tushare://history/${symbol}`,
      source: 'Tushare pro_bar bridge',
      cacheTtlMs: CACHE_TTLS.history,
      requestFn: async () => {
        const result = await runTushareBridge<Array<{
          date: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>>('history', { symbol, limit: count });

        const klines: KlineData[] = result.data.map((item) => ({
          date: formatBridgeDate(item.date) || item.date,
          open: Number(item.open),
          close: Number(item.close),
          high: Number(item.high),
          low: Number(item.low),
          volume: Number(item.volume),
        })).filter((item: KlineData) => Number.isFinite(item.close));

        if (klines.length === 0) {
          throw new Error(`Tushare bridge 未返回有效K线: ${symbol}`);
        }

        const issues: string[] = [...(result.issues || [])];
        if (klines.length < count) {
          issues.push(`K线样本不足，目标${count}条，实际${klines.length}条`);
        }

        return {
          data: {
            symbol,
            klines,
            ma5: calculateMA(klines, 5),
            ma10: calculateMA(klines, 10),
            ma20: calculateMA(klines, 20),
            ma60: calculateMA(klines, 60),
            ma120: calculateMA(klines, 120),
            atr14: calculateATR(klines, 14),
            fibSupport: calculateFibonacciSupport(klines, 60),
            rsi: calculateRSI(klines, 14),
            rsi6: calculateRSI(klines, 6),
            kdj: calculateKDJ(klines),
            macd: calculateMACD(klines),
            boll: calculateBOLL(klines, 20, 2),
            volumeTrend: analyzeVolumeTrend(klines),
            ma5Slope: calculateSlope(klines, 5),
            ma10Slope: calculateSlope(klines, 10),
            ma20Slope: calculateSlope(klines, 20),
            bias5: calculateBias(klines, 5),
            bias10: calculateBias(klines, 10),
            bias60: calculateBias(klines, 60),
          },
          issues,
          asOf: formatBridgeDate(result.asOf) || klines[klines.length - 1]?.date,
          isEstimated: result.isEstimated,
        };
      },
      fallbackFn: async () => {
        const response = await axios.get(url);
        const data = response.data;

        if (data.code !== 0) {
          throw new Error(`腾讯 K线 API 错误: ${data.msg}`);
        }

        const stockData = data.data[tencentSymbol];
        if (!stockData) {
          throw new Error(`未找到 ${symbol} 的历史数据`);
        }

        const klineList = stockData.qfqday || stockData.day || [];
        const klines: KlineData[] = klineList.map((item: any[]) => ({
          date: item[0],
          open: parseFloat(item[1]),
          close: parseFloat(item[2]),
          high: parseFloat(item[3]),
          low: parseFloat(item[4]),
          volume: parseFloat(item[5])
        })).filter((item: KlineData) => Number.isFinite(item.close));

        if (klines.length === 0) {
          throw new Error(`腾讯 K线接口未返回有效K线: ${symbol}`);
        }

        const issues: string[] = [];
        if (klines.length < count) {
          issues.push(`K线样本不足，目标${count}条，实际${klines.length}条`);
        }

        return {
          data: {
            symbol,
            klines,
            ma5: calculateMA(klines, 5),
            ma10: calculateMA(klines, 10),
            ma20: calculateMA(klines, 20),
            ma60: calculateMA(klines, 60),
            ma120: calculateMA(klines, 120),
            atr14: calculateATR(klines, 14),
            fibSupport: calculateFibonacciSupport(klines, 60),
            rsi: calculateRSI(klines, 14),
            rsi6: calculateRSI(klines, 6),
            kdj: calculateKDJ(klines),
            macd: calculateMACD(klines),
            boll: calculateBOLL(klines, 20, 2),
            volumeTrend: analyzeVolumeTrend(klines),
            ma5Slope: calculateSlope(klines, 5),
            ma10Slope: calculateSlope(klines, 10),
            ma20Slope: calculateSlope(klines, 20),
            bias5: calculateBias(klines, 5),
            bias10: calculateBias(klines, 10),
            bias60: calculateBias(klines, 60),
          },
          issues,
          asOf: klines[klines.length - 1]?.date,
        };
      }
    });

    return {
      ...history,
      dataQuality: meta,
    };
  } catch (error) {
    console.error(`获取 ${symbol} 历史数据时出错:`, error);
    throw error;
  }
}

// 辅助函数：计算斜率 (基于线性回归或简单角度近似)
// 这里使用简单的反正切 (Atan) 计算最近 N 天均线的角度
// 注意：这只是一个近似值，用于判断趋势陡峭程度
function calculateSlope(klines: KlineData[], period: number): number | null {
    if (klines.length < period + 5) return null; // 需要额外数据计算之前的 MA

    // 计算今天的 MA 和 3 天前的 MA
    const maToday = calculateMA(klines, period);
    const klinesPrev = klines.slice(0, klines.length - 3);
    const maPrev = calculateMA(klinesPrev, period);

    if (maToday === null || maPrev === null) return null;

    // 计算斜率: (MA_Today - MA_Prev) / 3
    // 为了标准化，除以当前价格
    const slope = (maToday - maPrev) / 3;
    const normalizedSlope = (slope / maToday) * 100; // 百分比变化

    // 转换为角度 (近似，假设 1% 涨幅对应 45度)
    // 这不是严格的几何角度，而是趋势强度指标
    const angle = Math.atan(normalizedSlope) * (180 / Math.PI);
    
    return Number(angle.toFixed(2));
}

// 辅助函数：计算乖离率 (BIAS)
// BIAS = (Close - MA) / MA * 100
function calculateBias(klines: KlineData[], period: number): number | null {
    if (klines.length < period) return null;
    
    const ma = calculateMA(klines, period);
    const close = klines[klines.length - 1].close;
    
    if (ma === null || ma === 0) return null;
    
    const bias = ((close - ma) / ma) * 100;
    return Number(bias.toFixed(2));
}

// 辅助函数：计算移动平均线 (MA)
function calculateMA(klines: KlineData[], period: number): number | null {
  if (klines.length < period) return null;
  const recentKlines = klines.slice(-period);
  const sum = recentKlines.reduce((acc, curr) => acc + curr.close, 0);
  return Number((sum / period).toFixed(2));
}

// 辅助函数：计算 BOLL
function calculateBOLL(klines: KlineData[], period: number = 20, stdDevMultiplier: number = 2): { upper: number, middle: number, lower: number } | null {
    if (klines.length < period) return null;
    
    // 中轨 = MA20
    const middle = calculateMA(klines, period);
    if (middle === null) return null;

    const recentKlines = klines.slice(-period);
    
    // 标准差计算
    const sumSqDiff = recentKlines.reduce((acc, curr) => {
        const diff = curr.close - middle;
        return acc + diff * diff;
    }, 0);
    
    const stdDev = Math.sqrt(sumSqDiff / period);
    
    const upper = middle + (stdDev * stdDevMultiplier);
    const lower = middle - (stdDev * stdDevMultiplier);
    
    return {
        upper: Number(upper.toFixed(2)),
        middle: Number(middle.toFixed(2)),
        lower: Number(lower.toFixed(2))
    };
}

// 辅助函数：分析量能趋势 (简单版)
function analyzeVolumeTrend(klines: KlineData[]): string {
    if (klines.length < 5) return '未知';
    const recent5 = klines.slice(-5);
    const volumes = recent5.map(k => k.volume);
    
    // 计算5日均量
    const avgVol = volumes.reduce((a, b) => a + b, 0) / 5;
    const currentVol = volumes[volumes.length - 1];
    
    if (currentVol > avgVol * 1.5) return '放量';
    if (currentVol < avgVol * 0.8) return '缩量';
    return '平量';
}

// 辅助函数：计算 ATR (14)
function calculateATR(klines: KlineData[], period: number = 14): number | null {
    if (klines.length < period + 1) return null;
    
    let trSum = 0;
    // 计算最近 'period' 天的 TR
    // TR = Max(H-L, Abs(H-PrevC), Abs(L-PrevC))
    // 我们需要 period+1 个数据点来正确计算最后一天的 ATR（如果使用 SMA 方法），
    // 或者只是计算最近 N 天的 TR 并取平均值。
    // 这里使用最近 N 天 TR 的简单平均值。
    
    const relevantKlines = klines.slice(-(period + 1)); // 获取 period + 1 条 K线，以便第一条有前收盘价
    
    // 我们需要 'period' 个 TR 值。
    // relevantKlines[0] 用作 relevantKlines[1] 的前收盘价
    
    let trValues: number[] = [];
    
    for (let i = 1; i < relevantKlines.length; i++) {
        const current = relevantKlines[i];
        const prev = relevantKlines[i-1];
        
        const hl = current.high - current.low;
        const hpc = Math.abs(current.high - prev.close);
        const lpc = Math.abs(current.low - prev.close);
        
        const tr = Math.max(hl, hpc, lpc);
        trValues.push(tr);
    }
    
    if (trValues.length === 0) return null;
    
    const sumATR = trValues.reduce((a, b) => a + b, 0);
    return Number((sumATR / trValues.length).toFixed(2));
}

// 辅助函数：计算黄金分割支撑 (0.618)
// 公式：近期高点 - (高点 - 低点) * 0.618 (从高点回撤的黄金比例)
function calculateFibonacciSupport(klines: KlineData[], period: number = 60): number | null {
    if (klines.length < period) return null;
    
    const recentKlines = klines.slice(-period);
    
    let maxHigh = -Infinity;
    let minLow = Infinity;
    
    recentKlines.forEach(k => {
        if (k.high > maxHigh) maxHigh = k.high;
        if (k.low < minLow) minLow = k.low;
    });
    
    if (maxHigh === -Infinity || minLow === Infinity) return null;
    
    // 从高点回撤 0.618 (支撑位)
    // 实际上标准的斐波那契回撤水平是 23.6%, 38.2%, 50%, 61.8%
    // 61.8% 回撤意味着价格下跌了波段的 61.8%。
    // 水平 = 低点 + (高点 - 低点) * (1 - 0.618) = 低点 + (高点 - 低点) * 0.382 ?
    // 或者是 水平 = 高点 - (高点 - 低点) * 0.618? (价格下跌了 61.8%?)
    // 通常 "黄金比例支撑" 指的是 0.618 水平。
    // 如果趋势向上，0.618 回撤支撑意味着：MaxHigh - (Range * 0.618)。
    
    const range = maxHigh - minLow;
    const support = maxHigh - (range * 0.618);
    
    return Number(support.toFixed(2));
}

// 辅助函数：计算 RSI
function calculateRSI(klines: KlineData[], period: number = 14): number | null {
    if (klines.length < period + 1) return null;
    
    // 计算价格变化
    let changes: number[] = [];
    for (let i = 1; i < klines.length; i++) {
        changes.push(klines[i].close - klines[i-1].close);
    }
    
    // 我们至少需要 'period' 个变化来计算第一个 RSI
    if (changes.length < period) return null;
    
    // 计算初始 AvgGain 和 AvgLoss
    let gains = 0;
    let losses = 0;
    
    // 对第一个周期使用简单移动平均 (SMA)
    for (let i = changes.length - period; i < changes.length; i++) {
        const change = changes[i];
        if (change > 0) gains += change;
        else losses -= change;
    }
    
    // 对最新点进行简单平均 RSI 计算
    // 注意：标准 RSI 使用 EMA 平滑 (Wilder's Smoothing)。
    // 为了简单起见以及在数据量较小情况下的稳健性，这里使用简单平均作为近似，
    // 但如果有足够的数据，我们应该尝试正确实现。
    // 然而，只有 120 个点，无状态的简单窗口实现更安全。
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Number(rsi.toFixed(2));
}

// 辅助函数：计算 KDJ
// 默认参数: 9, 3, 3
function calculateKDJ(klines: KlineData[], period: number = 9): { k: number, d: number, j: number } | null {
    if (klines.length < period) return null;
    
    // KDJ 需要递归计算。
    // 初始值 (通常为 50)
    let k = 50;
    let d = 50;
    
    // 我们遍历所有 K 线来构建值
    for (let i = 0; i < klines.length; i++) {
        // 查找当前窗口的 RSV
        if (i < period - 1) continue; // 需要 'period' 天的数据
        
        // 窗口: [i - period + 1, i]
        const window = klines.slice(i - period + 1, i + 1);
        const close = klines[i].close;
        
        let lowN = Infinity;
        let highN = -Infinity;
        
        window.forEach(item => {
            if (item.low < lowN) lowN = item.low;
            if (item.high > highN) highN = item.high;
        });
        
        let rsv = 50;
        if (highN !== lowN) {
            rsv = ((close - lowN) / (highN - lowN)) * 100;
        }
        
        // K = 2/3 * PrevK + 1/3 * RSV
        k = (2/3) * k + (1/3) * rsv;
        // D = 2/3 * PrevD + 1/3 * K
        d = (2/3) * d + (1/3) * k;
    }
    
    const j = 3 * k - 2 * d;
    
    return {
        k: Number(k.toFixed(2)),
        d: Number(d.toFixed(2)),
        j: Number(j.toFixed(2))
    };
}

// 辅助函数：计算 MACD
// 标准参数: 12, 26, 9
function calculateMACD(klines: KlineData[]): { diff: number, dea: number, macd: number } | null {
    if (klines.length < 26) return null;
    
    const shortPeriod = 12;
    const longPeriod = 26;
    const signalPeriod = 9;
    
    // 计算 EMA
    const calcEMA = (data: KlineData[], period: number) => {
        const k = 2 / (period + 1);
        let emaArray: number[] = [];
        let ema = data[0].close; // 初始 SMA
        emaArray.push(ema);
        
        for (let i = 1; i < data.length; i++) {
            ema = (data[i].close - ema) * k + ema;
            emaArray.push(ema);
        }
        return emaArray;
    };
    
    const ema12 = calcEMA(klines, shortPeriod);
    const ema26 = calcEMA(klines, longPeriod);
    
    // DIFF = EMA12 - EMA26
    let diffs: number[] = [];
    for (let i = 0; i < klines.length; i++) {
        diffs.push(ema12[i] - ema26[i]);
    }
    
    // DEA = EMA(DIFF, 9)
    // 我们需要计算 diffs 数组的 EMA
    const calcEMAFromValues = (values: number[], period: number) => {
         const k = 2 / (period + 1);
         let ema = values[0];
         let emaArray: number[] = [];
         emaArray.push(ema);
         
         for (let i = 1; i < values.length; i++) {
             ema = (values[i] - ema) * k + ema;
             emaArray.push(ema);
         }
         return emaArray;
    };
    
    const deas = calcEMAFromValues(diffs, signalPeriod);
    
    // 最新值
    const lastIndex = klines.length - 1;
    const diff = diffs[lastIndex];
    const dea = deas[lastIndex];
    const macd = (diff - dea) * 2;
    
    return {
        diff: Number(diff.toFixed(3)),
        dea: Number(dea.toFixed(3)),
        macd: Number(macd.toFixed(3))
    };
}

// 辅助函数：搜索股票 (使用腾讯 Smartbox API)
export async function searchStocks(query: string): Promise<Array<{ symbol: string; name: string }>> {
    try {
        const result = await runTushareBridge<Array<{ symbol: string; name: string }>>('search', { query, limit: 20 });
        return result.data.map((item) => ({
            symbol: item.symbol,
            name: item.name,
        }));
    } catch (error) {
        console.error('Tushare 搜索股票出错，回退到腾讯 Smartbox:', error);
    }

    const url = `http://smartbox.gtimg.cn/s3/?t=all&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const data = iconv.decode(response.data, 'gbk');
        const unescapedData = data.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
            return String.fromCharCode(parseInt(grp, 16));
        });

        const match = unescapedData.match(/="(.*)"/);
        if (!match || !match[1]) return [];

        const items = match[1].split('^');
        
        return items.map(item => {
            const parts = item.split('~');
            let market = '';
            let code = '';
            let name = '';
            let type = '';
            
            if (parts[0] === 'sh' || parts[0] === 'sz') {
                market = parts[0];
                code = parts[1];
                name = parts[2];
                type = parts[4];
            } else {
                const m = parts[0].match(/([a-z]+)(\d+)/);
                if (m) {
                    market = m[1];
                    code = m[2];
                }
                name = parts[1];
                type = parts[4];
            }
            
            if (type !== 'GP-A' && type !== 'GP') {
                return null;
            }

            let symbol = '';
            if (market === 'sz') {
                symbol = `${code}.SZ`;
            } else if (market === 'sh') {
                symbol = `${code}.SH`;
            } else {
                return null;
            }

            return {
                symbol: symbol,
                name: name
            };
        }).filter((item): item is { symbol: string; name: string } => item !== null);

    } catch (fallbackError) {
        console.error('搜索股票出错:', fallbackError);
        return [];
    }
}

// ------------------------------------------------------------------
// 新增：行业板块与排行功能 (使用东方财富 API)
// ------------------------------------------------------------------

/**
 * 获取股票所属行业/板块 (基于东方财富 API)
 * @param symbol 股票代码 (e.g. "000933.SZ")
 * @returns 行业名称 (e.g. "有色金属")
 */
export async function fetchStockSector(symbol: string): Promise<string> {
    const secid = toSecid(symbol);
    if (!secid) return '未知行业';

    const url = `http://push2.eastmoney.com/api/qt/stock/get?ut=fa5fd1943c7b386f172d6893dbfba10b&fltt=2&invt=2&fields=f127&secid=${secid}`;

    try {
        const { data } = await fetchWithPublicApiResilience<string>({
            cacheKey: `sector:${symbol}`,
            endpoint: `tushare://sector/${symbol}`,
            source: 'Tushare sector bridge',
            cacheTtlMs: CACHE_TTLS.sector,
            requestFn: async () => {
                const result = await runTushareBridge<string>('sector', { symbol });
                return {
                    data: result.data || '未知行业',
                    asOf: formatBridgeDate(result.asOf),
                    issues: result.issues,
                    isEstimated: result.isEstimated,
                };
            },
            fallbackFn: async () => {
                const response = await requestEastMoney(url);
                const payload = response.data;
                if (payload && payload.data && payload.data.f127) {
                    return { data: payload.data.f127 };
                }
                return {
                    data: '未知行业',
                    isEstimated: true,
                    issues: ['东方财富行业接口未返回 f127，已降级为未知行业'],
                };
            },
        });
        return data;
    } catch (error) {
        console.error(`获取行业信息失败 ${symbol}:`, error);
        return '未知行业';
    }
}

export interface SectorData {
    code: string;       // f12
    name: string;       // f14
    changePercent: number; // f3
}

/**
 * 获取东方财富行业板块排行 (涨幅榜)
 * @param limit 获取前多少名
 */
export async function fetchIndustryRank(limit: number = 20): Promise<SectorData[]> {
    const url = 'http://push2.eastmoney.com/api/qt/clist/get';
    const fields = 'f12,f14,f3';

    const params = {
        pn: 1,
        pz: limit,
        po: 1, // 降序
        np: 1,
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: 2,
        invt: 2,
        fid: 'f3', // 按涨跌幅排序
        fs: 'm:90 t:2 f:!50', // 行业板块
        fields: fields
    };

    try {
        const { data } = await fetchWithPublicApiResilience<SectorData[]>({
            cacheKey: `industry-rank:${limit}`,
            endpoint: `tushare://industry_rank/${limit}`,
            source: 'Tushare industry rank bridge',
            cacheTtlMs: CACHE_TTLS.industryRank,
            requestFn: async () => {
                const result = await runTushareBridge<SectorData[]>('industry_rank', { limit });
                return {
                    data: result.data,
                    asOf: formatBridgeDate(result.asOf),
                    issues: result.issues,
                    isEstimated: result.isEstimated,
                };
            },
            fallbackFn: async () => {
                const response = await requestEastMoney(url, params);
                const data = response.data?.data?.diff;

                if (!data || !Array.isArray(data)) {
                    return {
                        data: [],
                        issues: ['东方财富行业排行接口未返回 diff 数组'],
                    };
                }

                return {
                    data: data.map((item: any) => ({
                        code: item.f12,
                        name: item.f14,
                        changePercent: item.f3
                    })),
                };
            },
        });

        return data;
    } catch (error) {
        console.error('获取行业板块排行失败:', error);
        return [];
    }
}

// ------------------------------------------------------------------
// 新增：基本面与资金流向数据 (对齐 DeepSeek Client 策略)
// ------------------------------------------------------------------

export interface FinancialData {
    pe: number;          // 市盈率(动)
    pb: number;          // 市净率
    roe: number;         // ROE
    grossMargin: number; // 毛利率
    netMargin: number;   // 净利率
    debtRatio: number;   // 负债率
    revenueYoY: number;  // 营收同比
    profitYoY: number;   // 净利同比
    marketCap: number;   // 总市值 (新增)
    dataQuality?: DataQualityMeta;
}

export interface FundFlowData {
    date: string;
    mainNetInflow: number; // 主力净流入 (万元)
    mainNetInflowRate: number | null; // 主力净流入占比 (%)
    superLargeInflow: number; // 超大单流入 (万元)
    largeInflow: number; // 大单流入 (万元)
    mediumInflow: number | null; // 中单流入 (万元)
    smallInflow: number | null; // 小单流入 (万元)
    close: number | null; // 当日收盘价 (新增，用于量价分析)
    changePercent: number | null; // 当日涨跌幅 (新增，用于量价分析)
    dataQuality?: DataQualityMeta;
}

/**
 * 获取个股基本面财务指标
 * @param symbol 股票代码
 */
export async function fetchFinancialData(symbol: string): Promise<FinancialData | null> {
    const secid = toSecid(symbol);
    if (!secid) return null;

    const fields = 'f162,f167,f173,f186,f187,f188,f184,f185,f116';
    const url = `http://push2.eastmoney.com/api/qt/stock/get?ut=fa5fd1943c7b386f172d6893dbfba10b&fltt=2&invt=2&fields=${fields}&secid=${secid}`;

    try {
        const { data, meta } = await fetchWithPublicApiResilience<Omit<FinancialData, 'dataQuality'>>({
            cacheKey: `financial:${symbol}`,
            endpoint: `tushare://financial/${symbol}`,
            source: 'Tushare financial bridge',
            cacheTtlMs: CACHE_TTLS.financial,
            requestFn: async () => {
                const result = await runTushareBridge<Omit<FinancialData, 'dataQuality'> & {
                    turnoverRate?: number | null;
                    volumeRatio?: number | null;
                }>('financial', { symbol });

                return {
                    data: result.data,
                    asOf: formatBridgeDate(result.asOf),
                    issues: result.issues,
                    isEstimated: result.isEstimated,
                };
            },
            fallbackFn: async () => {
                const response = await requestEastMoney(url);
                const data = response.data?.data;

                if (!data) {
                    throw new Error('东方财富财务接口未返回 data 节点');
                }

                return {
                    data: {
                        pe: data.f162 || 0,
                        pb: data.f167 || 0,
                        roe: data.f173 || 0,
                        grossMargin: data.f186 || 0,
                        netMargin: data.f187 || 0,
                        debtRatio: data.f188 || 0,
                        revenueYoY: data.f184 || 0,
                        profitYoY: data.f185 || 0,
                        marketCap: data.f116 || 0
                    },
                };
            },
        });
        return {
            ...data,
            dataQuality: meta,
        };
    } catch (error) {
        console.error(`获取基本面数据失败 ${symbol}:`, error);
        return null;
    }
}

/**
 * 获取个股资金流向数据
 * 优先走 Tushare，失败后回退到东方财富近 30 日资金流。
 */
export async function fetchFundFlowData(symbol: string): Promise<FundFlowData[]> {
    const market = toMarketCode(symbol);
    const code = toPlainCode(symbol);
    if (!market) return [];

    try {
        const { data, meta } = await fetchWithPublicApiResilience<FundFlowData[]>({
            cacheKey: `fundflow:${symbol}`,
            endpoint: `tushare://fundflow/${symbol}`,
            source: 'Tushare moneyflow bridge',
            cacheTtlMs: CACHE_TTLS.fundFlow,
            requestFn: async () => {
                const result = await runTushareBridge<FundFlowData[]>('fundflow', { symbol, code, market, limit: 30 });
                return {
                    data: result.data.map((record) => ({
                        ...record,
                        date: formatBridgeDate(record.date) || record.date,
                    })),
                    asOf: formatBridgeDate(result.asOf),
                    issues: result.issues,
                    isEstimated: result.isEstimated,
                };
            },
            fallbackFn: async () => fetchFundFlowFromEastMoney(symbol),
        });

        return data.map((record) => ({
            ...record,
            dataQuality: record.dataQuality || meta,
        }));
    } catch (error) {
        console.error(`获取资金流向失败 ${symbol}:`, error);
        return [];
    }
}
    
async function fetchFundFlowFromEastMoney(symbol: string): Promise<RequestResult<FundFlowData[]>> {
        const secid = toSecid(symbol);
        if (!secid) return { data: [] };

    const urlHis = 'http://push2his.eastmoney.com/api/qt/stock/fflow/kline/get';
    const urlReal = 'http://push2.eastmoney.com/api/qt/stock/fflow/kline/get'; // 回退接口
    
    // 经过测试，东方财富资金流接口经常缺少中单/小单或价格字段。
    // 这里保留缺失值并把问题写进 dataQuality，避免再做伪造反推。
    
    const params = {
        lmt: 0, // 0 获取所有数据
        klt: 101,
        fields1: 'f1,f2,f3,f7',
        fields2: 'f51,f53,f55,f57,f59,f2,f3', // f51:主力, f53:超大, f55:大, f57:中, f59:小, f2:收盘, f3:涨跌
        secid: secid
    };

    const response = await requestEastMoney(urlHis, params).catch(async () => requestEastMoney(urlReal, params));
    const klines = response.data?.data?.klines;
    if (!klines || !Array.isArray(klines)) {
        throw new Error('东方财富资金流接口未返回 klines');
    }
    return parseEastMoneyFundFlowKlines(klines);
}

function parseEastMoneyFundFlowKlines(klines: string[]): RequestResult<FundFlowData[]> {
    const issues: string[] = [];

    const records = klines.map((item: string) => {
        const parts = item.split(',');
        const superLarge = Number.isFinite(parseFloat(parts[1])) ? parseFloat(parts[1]) : 0;
        const large = Number.isFinite(parseFloat(parts[2])) ? parseFloat(parts[2]) : 0;
        const medium = Number.isFinite(parseFloat(parts[3])) ? parseFloat(parts[3]) : null;
        const small = Number.isFinite(parseFloat(parts[4])) ? parseFloat(parts[4]) : null;
        const close = Number.isFinite(parseFloat(parts[5])) ? parseFloat(parts[5]) : null;
        const changePercent = Number.isFinite(parseFloat(parts[6])) ? parseFloat(parts[6]) : null;
        const mainNetInflow = superLarge + large;

        const rowIssues: string[] = [];
        if (parts.length <= 3) {
            rowIssues.push('接口仅返回超大单和大单，缺少中小单明细');
        }
        if (medium === null) rowIssues.push('中单缺失');
        if (small === null) rowIssues.push('小单缺失');
        if (close === null) rowIssues.push('资金流接口未返回收盘价');
        if (changePercent === null) rowIssues.push('资金流接口未返回涨跌幅');

        return {
            date: parts[0],
            mainNetInflow,
            mainNetInflowRate: null,
            superLargeInflow: superLarge,
            largeInflow: large,
            mediumInflow: medium,
            smallInflow: small,
            close,
            changePercent,
            dataQuality: createMeta({
                source: 'EastMoney fflow/kline',
                endpoint: 'fflow row',
                tier: 'primary',
                asOf: parts[0],
                isEstimated: false,
                issues: rowIssues,
            }),
        } as FundFlowData;
    }).slice(-30);

    if (records.some((record) => record.mediumInflow === null || record.smallInflow === null)) {
        issues.push('资金流接口缺少中单/小单明细，已按缺失处理，不再反推伪造');
    }
    if (records.every((record) => record.close === null || record.changePercent === null)) {
        issues.push('资金流接口缺少价格字段，需要由K线数据补全价格背景');
    }

    return {
        data: records,
        issues,
        asOf: records[records.length - 1]?.date,
    };
}
