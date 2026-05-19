import fs from 'fs';
import path from 'path';
import { analyzeStock, AIAnalysisResult } from './aiEngine';
import {
  fetchStockSnapshot,
  fetchStockHistory,
  fetchStockSector,
  fetchIndustryRank,
  fetchFinancialData,
  fetchFundFlowData,
} from './dataService';
import { buildContinuitySummary, getLatestHistoryBySymbol } from './historyService';

const DAILY_ADVICE_FILE = path.join(process.cwd(), 'data', 'daily_advice.json');

export type DailyAdviceAction = 'buy' | 'sell' | 'hold' | 'watch';

export interface DailyAdviceRecord {
  id: string;
  date: string;
  timestamp: number;
  symbol: string;
  stockName: string;
  action: DailyAdviceAction;
  confidence: number;
  score: number;
  summary: string;
  reasons: string[];
  riskFlags: string[];
  entryRange?: string;
  stopLoss?: string;
  targetPrice?: string;
  holdingPeriod?: string;
  analysisMode: 'postmarket';
  dataQuality?: AIAnalysisResult['dataQuality'];
  sourceReport: {
    advice: string;
    oneLineDecision?: string;
    reasoning?: string;
  };
  continuity?: {
    previousAction?: DailyAdviceAction;
    changed: boolean;
    changeSummary?: string;
  };
}

export interface DailyAdviceQuery {
  symbol?: string;
  date?: string;
  limit?: number;
}

function ensureDailyAdviceFile() {
  const dataDir = path.dirname(DAILY_ADVICE_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(DAILY_ADVICE_FILE)) {
    fs.writeFileSync(DAILY_ADVICE_FILE, JSON.stringify([], null, 2));
  }
}

function getTodayDateString(timestamp = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

function normalizeWhitespace(value?: string | null): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitReasonText(text?: string, maxLength = 120): string[] {
  if (!text) return [];

  const normalized = normalizeWhitespace(text)
    .replace(/[：:]/g, '，')
    .replace(/[。！？；]/g, '。|')
    .split('|')
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);

  const segments = normalized.length > 0 ? normalized : [normalizeWhitespace(text)];
  return segments
    .map((item) => (item.length > maxLength ? `${item.slice(0, maxLength)}...` : item))
    .filter(Boolean);
}

function dedupeStrings(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = normalizeWhitespace(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function mapAdviceToAction(rawAdvice: string): DailyAdviceAction {
  const advice = normalizeWhitespace(rawAdvice);

  if (/卖出|减仓|止盈|止损|离场|退出/.test(advice)) return 'sell';
  if (/持有/.test(advice)) return 'hold';
  if (/观望|观察|等待|暂不|谨慎|确认/.test(advice)) return 'watch';
  if (/强烈买入|买入|加仓|建仓|低吸/.test(advice)) return 'buy';

  return 'watch';
}

function extractConfidence(result: AIAnalysisResult): number {
  const confidenceText = normalizeWhitespace(result.tradingStrategy?.coreDecision?.confidenceLevel);
  const matched = confidenceText.match(/\d+(\.\d+)?/);
  if (matched) {
    const parsed = parseFloat(matched[0]);
    if (Number.isFinite(parsed)) return Math.min(Math.max(parsed, 0), 10);
  }

  const fallback = result.score / 10;
  return Number.isFinite(fallback) ? Number(fallback.toFixed(1)) : 5;
}

function buildRiskFlags(result: AIAnalysisResult): string[] {
  const flags: string[] = [];

  const qualityIssues = [
    ...(result.dataQuality?.snapshot?.issues || []),
    ...(result.dataQuality?.history?.issues || []),
    ...(result.dataQuality?.financial?.issues || []),
    ...(result.dataQuality?.fundFlow?.summary?.issues || []),
  ];

  if (!result.dataQuality?.financial) {
    flags.push('财务数据缺失');
  }

  if (!result.dataQuality?.fundFlow?.summary) {
    flags.push('资金流数据缺失');
  }

  if ((result.dataQuality?.fundFlow?.missingDays || 0) > 0) {
    flags.push(`资金流有 ${result.dataQuality?.fundFlow?.missingDays} 个交易日字段缺失`);
  }

  if (result.detailedAnalysis?.marketAnalysis?.riskAssessment) {
    flags.push(...splitReasonText(result.detailedAnalysis.marketAnalysis.riskAssessment, 80).slice(0, 2));
  }

  return dedupeStrings([...flags, ...qualityIssues]).slice(0, 5);
}

function applyGuardrails(record: DailyAdviceRecord): DailyAdviceRecord {
  const next = { ...record, riskFlags: [...record.riskFlags] };
  const snapshotQuality = next.dataQuality?.snapshot?.qualityScore ?? 0;
  const historyQuality = next.dataQuality?.history?.qualityScore ?? 0;
  const financialQuality = next.dataQuality?.financial?.qualityScore ?? null;
  const fundFlowQuality = next.dataQuality?.fundFlow?.summary?.qualityScore ?? null;
  const missingDays = next.dataQuality?.fundFlow?.missingDays ?? 0;

  const weakCoreData = snapshotQuality < 60 || historyQuality < 60;
  const weakSupportData =
    !next.dataQuality?.financial ||
    !next.dataQuality?.fundFlow?.summary ||
    (financialQuality !== null && financialQuality < 55) ||
    (fundFlowQuality !== null && fundFlowQuality < 55);

  if (weakCoreData && next.action === 'buy') {
    next.action = 'watch';
    next.summary = '核心数据质量偏弱，建议先观察，不直接执行买入。';
    next.riskFlags = dedupeStrings([...next.riskFlags, '核心数据质量不足，买入建议已降级']);
    next.confidence = Math.min(next.confidence, 5.8);
  }

  if (weakSupportData && next.action === 'buy') {
    next.action = 'watch';
    next.summary = '辅助数据不完整或质量偏弱，建议先观察，等待更多确认。';
    next.riskFlags = dedupeStrings([...next.riskFlags, '辅助数据不足，买入建议已降级']);
    next.confidence = Math.min(next.confidence, 6.2);
  }

  if ((!next.stopLoss || next.stopLoss === 'N/A') && next.action === 'buy') {
    next.action = 'watch';
    next.summary = '止损位不够清晰，建议先观察，避免直接执行买入。';
    next.riskFlags = dedupeStrings([...next.riskFlags, '止损位不清晰，买入建议已降级']);
    next.confidence = Math.min(next.confidence, 6);
  }

  if (next.score < 50 && next.action === 'buy') {
    next.action = 'watch';
    next.summary = '综合评分偏低，建议先观察，不直接执行买入。';
    next.riskFlags = dedupeStrings([...next.riskFlags, '综合评分偏低，买入建议已降级']);
    next.confidence = Math.min(next.confidence, 5.5);
  }

  if (missingDays > 10 && next.action === 'buy') {
    next.action = 'watch';
    next.summary = '资金流字段缺失较多，建议先观察，等待更完整的数据。';
    next.riskFlags = dedupeStrings([...next.riskFlags, '资金流字段缺失较多，买入建议已降级']);
    next.confidence = Math.min(next.confidence, 5.8);
  }

  return next;
}

function buildContinuity(
  currentAction: DailyAdviceAction,
  previous?: DailyAdviceRecord | null
): DailyAdviceRecord['continuity'] {
  if (!previous) {
    return {
      changed: false,
      changeSummary: '首次生成每日建议，暂无历史对比。',
    };
  }

  const changed = previous.action !== currentAction;
  return {
    previousAction: previous.action,
    changed,
    changeSummary: changed
      ? `建议由 ${previous.action} 调整为 ${currentAction}。`
      : `建议维持 ${currentAction} 不变。`,
  };
}

function extractAdviceFromAnalysis(
  symbol: string,
  stockName: string,
  date: string,
  timestamp: number,
  result: AIAnalysisResult,
  previous?: DailyAdviceRecord | null
): DailyAdviceRecord {
  const sourceAdvice = normalizeWhitespace(
    result.tradingStrategy?.coreDecision?.action ||
      result.advice ||
      result.executiveSummary?.oneLineDecision
  );

  const summary =
    normalizeWhitespace(result.executiveSummary?.oneLineDecision) ||
    normalizeWhitespace(result.reasoning) ||
    normalizeWhitespace(result.tradingStrategy?.coreDecision?.reasoning) ||
    '请结合完整报告进一步判断。';

  const reasons = dedupeStrings([
    splitReasonText(result.executiveSummary?.coreLogic, 80)[0],
    splitReasonText(result.reasoning, 80)[0],
    splitReasonText(result.tradingStrategy?.coreDecision?.reasoning, 80)[0],
    splitReasonText(result.detailedAnalysis?.technicalAnalysis?.detailedReason, 80)[0],
    splitReasonText(result.detailedAnalysis?.fundamentalAnalysis?.detailedReason, 80)[0],
    splitReasonText(result.detailedAnalysis?.fundFlowAnalysis?.detailedReason, 80)[0],
  ]).slice(0, 3);

  const record: DailyAdviceRecord = {
    id: `${symbol}_${date}`,
    date,
    timestamp,
    symbol,
    stockName,
    action: mapAdviceToAction(sourceAdvice),
    confidence: extractConfidence(result),
    score: Number(result.score.toFixed(1)),
    summary,
    reasons,
    riskFlags: buildRiskFlags(result),
    entryRange: normalizeWhitespace(result.tradingStrategy?.entryPlan?.optimalEntry) || undefined,
    stopLoss: normalizeWhitespace(result.tradingStrategy?.riskManagement?.stopLoss?.price) || undefined,
    targetPrice: normalizeWhitespace(result.tradingStrategy?.profitTaking?.target1?.price) || undefined,
    holdingPeriod: normalizeWhitespace(result.performanceMetrics?.holdingPeriod) || undefined,
    analysisMode: 'postmarket',
    dataQuality: result.dataQuality,
    sourceReport: {
      advice: sourceAdvice || 'N/A',
      oneLineDecision: normalizeWhitespace(result.executiveSummary?.oneLineDecision) || undefined,
      reasoning: normalizeWhitespace(result.reasoning) || undefined,
    },
    continuity: buildContinuity(mapAdviceToAction(sourceAdvice), previous),
  };

  return applyGuardrails(record);
}

export function getDailyAdviceHistory(query: DailyAdviceQuery = {}): DailyAdviceRecord[] {
  ensureDailyAdviceFile();

  try {
    const data = fs.readFileSync(DAILY_ADVICE_FILE, 'utf-8');
    const items = JSON.parse(data) as DailyAdviceRecord[];

    return items
      .filter((item) => {
        if (query.symbol && item.symbol !== query.symbol) return false;
        if (query.date && item.date !== query.date) return false;
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, query.limit && query.limit > 0 ? query.limit : items.length);
  } catch (error) {
    console.error('读取每日建议文件出错:', error);
    return [];
  }
}

export function getLatestDailyAdvice(symbol: string): DailyAdviceRecord | null {
  return getDailyAdviceHistory({ symbol, limit: 1 })[0] || null;
}

export function saveDailyAdvice(record: DailyAdviceRecord): DailyAdviceRecord {
  ensureDailyAdviceFile();
  const history = getDailyAdviceHistory();
  const next = history.filter((item) => !(item.symbol === record.symbol && item.date === record.date));
  next.unshift(record);
  fs.writeFileSync(DAILY_ADVICE_FILE, JSON.stringify(next, null, 2));
  return record;
}

export async function generateDailyAdviceForSymbol(
  symbol: string,
  analysts: string[] = ['technical', 'fundamental', 'capital']
): Promise<DailyAdviceRecord> {
  const timestamp = Date.now();
  const date = getTodayDateString(timestamp);

  const [snapshot, history] = await Promise.all([
    fetchStockSnapshot(symbol, 'postmarket'),
    fetchStockHistory(symbol),
  ]);

  const [sectorName, industryRankList, financial, fundFlow] = await Promise.all([
    fetchStockSector(symbol),
    fetchIndustryRank(20),
    fetchFinancialData(symbol),
    fetchFundFlowData(symbol),
  ]);

  const industryInfo = {
    name: sectorName,
    isTopRanked: false,
    rankText: '未上榜',
  };

  if (sectorName && sectorName !== '未知行业') {
    const rankIndex = industryRankList.findIndex((item) => item.name === sectorName);
    if (rankIndex !== -1) {
      industryInfo.isTopRanked = true;
      industryInfo.rankText = `行业排名第 ${rankIndex + 1}`;
    } else {
      industryInfo.rankText = '行业表现一般 (未入前20)';
    }
  }

  const aiResult = await analyzeStock({
    stockName: snapshot.name || symbol,
    snapshot,
    history,
    industryInfo,
    financial,
    fundFlow,
    previousReport: buildContinuitySummary(getLatestHistoryBySymbol(symbol, 'postmarket')),
    mode: 'postmarket',
    analysts,
  });

  const previousAdvice =
    getDailyAdviceHistory({ symbol })
      .find((item) => item.date !== date) || null;
  const record = extractAdviceFromAnalysis(
    symbol,
    snapshot.name || symbol,
    date,
    timestamp,
    aiResult,
    previousAdvice
  );

  return saveDailyAdvice(record);
}

export async function generateDailyAdviceBatch(
  symbols: string[],
  analysts: string[] = ['technical', 'fundamental', 'capital']
): Promise<Array<DailyAdviceRecord | { symbol: string; error: string }>> {
  const results: Array<DailyAdviceRecord | { symbol: string; error: string }> = [];

  for (const rawSymbol of symbols) {
    const symbol = normalizeWhitespace(rawSymbol);
    if (!symbol) continue;

    try {
      const record = await generateDailyAdviceForSymbol(symbol, analysts);
      results.push(record);
    } catch (error) {
      results.push({
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
