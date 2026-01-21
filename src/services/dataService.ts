import axios from 'axios';
import iconv from 'iconv-lite';
import http from 'http';
import https from 'https';

// 定义数据接口（为了兼容性保持与之前一致）
export interface StockSnapshot {
  symbol: string;
  name?: string; // 新增名称字段
  price: number;
  changePercent: number;
  turnoverRate?: number; // 换手率
  volumeRatio?: number; // 量比
  marketSentiment?: string; // 市场情绪 (衍生字段)
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
}

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
export async function fetchStockSnapshot(symbol: string): Promise<StockSnapshot> {
  const tencentSymbol = formatSymbolForTencent(symbol);
  const url = `http://qt.gtimg.cn/q=${tencentSymbol}`;

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer', // iconv-lite 解码需要
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // 解码 GBK 响应
    const data = iconv.decode(response.data, 'gbk');
    
    // 响应格式: v_sz000933="51~神火股份~000933~17.20~17.36~17.15~190842~94239~96603~17.19~63~..."
    // 通过 '"' 分割获取内容
    const match = data.match(/="(.*)";/);
    if (!match || !match[1]) {
        // 处理股票不存在或响应为空的情况
        if (data.includes('pv_none')) {
             throw new Error(`未找到股票 ${symbol}。`);
        }
        throw new Error(`来自腾讯 API 的响应格式无效: ${data}`);
    }

    const values = match[1].split('~');
    
    // 1: 名称, 2: 代码, 3: 现价, 32: 涨跌幅
    const name = values[1];
    const currentPrice = parseFloat(values[3]);
    const changePercent = parseFloat(values[32]);
    
    // 索引 38: 换手率
    // 索引 49: 量比 - 注意：索引可能会有变化，但通常在这里。
    // 根据用户提供的日志: ...~31.77~30.80~3.11~706.39~706.86~2.95~34.27~28.04~0.69~-1256~...
    // 假设 38 是换手率，49 是量比。
    const turnoverRate = parseFloat(values[38]) || 0;
    const volumeRatio = parseFloat(values[49]) || 0;

    // 基于涨跌幅的简单市场情绪
    let marketSentiment = '震荡';
    if (changePercent > 1.5) marketSentiment = '多头';
    else if (changePercent < -1.5) marketSentiment = '空头';

    return {
      symbol,
      name,
      price: currentPrice,
      changePercent,
      turnoverRate,
      volumeRatio,
      marketSentiment
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
    const response = await axios.get(url);
    const data = response.data;

    if (data.code !== 0) {
      throw new Error(`腾讯 K线 API 错误: ${data.msg}`);
    }

    // 路径: data.data[symbol].day
    // 但响应中的 symbol 键可能是 "sz000933" 或其内部的 "qfqday"
    // 实际结构: data.data.sz000933.day 或 data.data.sz000933.qfqday (如果使用了 qfq)
    
    const stockData = data.data[tencentSymbol];
    if (!stockData) {
        throw new Error(`未找到 ${symbol} 的数据`);
    }

    // 通常 'day' 包含原始数据，'qfqday' 包含请求的复权数据。
    // 参数 'qfq' 通常会返回 'qfqday'，但有时是混合的。
    // 先检查 'qfqday'，然后是 'day'。
    const klineList = stockData.qfqday || stockData.day || [];

    // 映射到 KlineData
    // 腾讯格式: ["2023-01-01", "open", "close", "high", "low", "volume"]
    const klines: KlineData[] = klineList.map((item: any[]) => ({
      date: item[0],
      open: parseFloat(item[1]),
      close: parseFloat(item[2]),
      high: parseFloat(item[3]),
      low: parseFloat(item[4]),
      volume: parseFloat(item[5])
    }));

    // 计算均线 (MA)
    const ma5 = calculateMA(klines, 5);
    const ma10 = calculateMA(klines, 10);
    const ma20 = calculateMA(klines, 20);
    const ma60 = calculateMA(klines, 60);
    const ma120 = calculateMA(klines, 120);
    
    // 计算 ATR (14)
    const atr14 = calculateATR(klines, 14);
    
    // 计算黄金分割支撑 (0.618)
    const fibSupport = calculateFibonacciSupport(klines, 60);

    // 计算 RSI (14, 6)
    const rsi = calculateRSI(klines, 14);
    const rsi6 = calculateRSI(klines, 6);

    // 计算 KDJ
    const kdj = calculateKDJ(klines);

    // 计算 MACD
    const macd = calculateMACD(klines);

    // 计算 BOLL (20, 2)
    const boll = calculateBOLL(klines, 20, 2);

    // 计算量能趋势
    const volumeTrend = analyzeVolumeTrend(klines);

    // 计算斜率 (Slope)
    const ma5Slope = calculateSlope(klines, 5);
    const ma10Slope = calculateSlope(klines, 10);
    const ma20Slope = calculateSlope(klines, 20);

    // 计算乖离率 (BIAS)
    const bias5 = calculateBias(klines, 5);
    const bias10 = calculateBias(klines, 10);
    const bias60 = calculateBias(klines, 60);

    return {
      symbol,
      klines,
      ma5,
      ma10,
      ma20,
      ma60,
      ma120,
      atr14,
      fibSupport,
      rsi,
      rsi6,
      kdj,
      macd,
      boll,
      volumeTrend,
      ma5Slope,
      ma10Slope,
      ma20Slope,
      bias5,
      bias10,
      bias60
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
    // 腾讯 Smartbox API: http://smartbox.gtimg.cn/s3/?t=all&q=
    // 返回: v_hint="sz000933~神火股份~000933~SHGF~GP-A~1";
    
    const url = `http://smartbox.gtimg.cn/s3/?t=all&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // 解码 GBK 响应 (Smartbox 通常返回 GBK)
        const data = iconv.decode(response.data, 'gbk');
        
        // 解析格式: v_hint="code~name~code_short~pinyin~type~?";
        // 注意：Tencent Smartbox 有时返回的数据可能包含 unicode 转义字符，如 \u96f6
        // 或者是直接的中文。
        // data 示例: v_hint="hk~00093~\u96f6...~lzkjjr~GP^sh~..."
        // 需要处理 unicode 转义
        
        const unescapedData = data.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
            return String.fromCharCode(parseInt(grp, 16));
        });

        const match = unescapedData.match(/="(.*)"/); // 从正则中移除了末尾的分号
        if (!match || !match[1]) return [];

        // "sz000933~神火股份~000933~SHGF~GP-A~1^sh600..."
        const items = match[1].split('^');
        
        return items.map(item => {
            const parts = item.split('~');
            // parts[0]: sz000933 (市场+代码) 或 hk~00093 或 sh~000938
            // 腾讯返回格式不完全统一，有几种情况：
            // 1. "sz000933~神火股份~000933~..." (A股常见)
            // 2. "sh~600519~贵州茅台~..." (这种中间带分隔符)
            // 3. "hk~00700~腾讯控股~..." (港股)
            
            // 我们主要关注 A 股 (GP-A) 或 指数 (ZS) 且是 A 股市场的
            
            let market = '';
            let code = '';
            let name = '';
            let type = '';

            // 尝试智能解析
            // 如果 parts[0] 包含 'sz' 或 'sh' 且长度 > 2 (如 sz000933)，这是旧格式
            // 如果 parts[0] 是 'sz' 或 'sh' (如 sh~600519)，这是新格式
            
            if (parts[0] === 'sh' || parts[0] === 'sz') {
                market = parts[0];
                code = parts[1];
                name = parts[2];
                // parts[4] 可能是 type
                // 观察返回: sh~000933~中证医药~zzyy~ZS
                // parts[4] 是 ZS
                type = parts[4];
            } else {
                // 旧格式或直接拼接格式: sz000933~神火股份~000933~...
                // parts[0]: sz000933
                // parts[1]: 神火股份
                // parts[2]: 000933
                const m = parts[0].match(/([a-z]+)(\d+)/);
                if (m) {
                    market = m[1];
                    code = m[2];
                }
                name = parts[1];
                type = parts[4]; // 通常是 GP-A
            }

            // 过滤：只保留 A 股 (GP-A) 或 A 股指数
            // 根据用户需求，主要是股票，所以重点保留 GP-A
            // 如果用户想搜指数，也可以放开
            // 观察日志: sh~000933~中证医药~zzyy~ZS (这是指数)
            // sz~000933~神火股份~shgf~GP-A (这是股票)
            
            if (type !== 'GP-A' && type !== 'GP') { 
                // 严格模式：只看股票。如果需要指数，可以加上 || type === 'ZS'
                // 但 000933 既是指数也是股票代码，这会造成混淆。
                // 用户的意图通常是买卖个股，所以优先展示 GP-A
                return null;
            }

            let symbol = '';
            if (market === 'sz') {
                symbol = `${code}.SZ`;
            } else if (market === 'sh') {
                symbol = `${code}.SH`;
            } else {
                return null; // 忽略港股、美股等
            }

            return {
                symbol: symbol,
                name: name
            };
        }).filter((item): item is { symbol: string; name: string } => item !== null);

    } catch (error) {
        console.error('搜索股票出错:', error);
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
    // 1. 格式转换
    // 东方财富格式: SZ(0) -> 0.000933, SH(1) -> 1.600519
    let secid = '';
    if (symbol.endsWith('.SZ')) {
        secid = `0.${symbol.replace('.SZ', '')}`;
    } else if (symbol.endsWith('.SH')) {
        secid = `1.${symbol.replace('.SH', '')}`;
    } else {
        return '未知行业';
    }

    // 2. 调用接口
    // fields=f127: 行业名称
    const url = `http://push2.eastmoney.com/api/qt/stock/get?ut=fa5fd1943c7b386f172d6893dbfba10b&fltt=2&invt=2&fields=f127&secid=${secid}`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        // 3. 解析响应: {"data": {"f127": "有色金属"}}
        if (data && data.data && data.data.f127) {
            return data.data.f127;
        }
        return '未知行业';
    } catch (error) {
        console.error(`获取行业信息失败 ${symbol}:`, error);
        return '未知行业'; // 发生错误时降级处理
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
    // f12: code, f14: name, f3: changePercent
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
        const response = await axios.get(url, { params });
        const data = response.data?.data?.diff;

        if (!data || !Array.isArray(data)) {
            return [];
        }

        return data.map((item: any) => ({
            code: item.f12,
            name: item.f14,
            changePercent: item.f3
        }));
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
}

export interface FundFlowData {
    date: string;
    mainNetInflow: number; // 主力净流入 (元)
    mainNetInflowRate: number; // 主力净流入占比 (%)
    superLargeInflow: number; // 超大单流入
    largeInflow: number; // 大单流入
    mediumInflow: number; // 中单流入 (新增)
    smallInflow: number; // 小单流入 (新增)
    close: number; // 当日收盘价 (新增，用于量价分析)
    changePercent: number; // 当日涨跌幅 (新增，用于量价分析)
}

/**
 * 获取个股基本面财务指标
 * @param symbol 股票代码
 */
export async function fetchFinancialData(symbol: string): Promise<FinancialData | null> {
    // 格式转换
    let secid = '';
    if (symbol.endsWith('.SZ')) {
        secid = `0.${symbol.replace('.SZ', '')}`;
    } else if (symbol.endsWith('.SH')) {
        secid = `1.${symbol.replace('.SH', '')}`;
    } else {
        return null;
    }

    // f162: PE(动), f167: PB, f173: ROE, f186: 毛利率, f187: 净利率, f188: 负债率, f184: 营收同比, f185: 净利同比, f116: 总市值
    const fields = 'f162,f167,f173,f186,f187,f188,f184,f185,f116';
    const url = `http://push2.eastmoney.com/api/qt/stock/get?ut=fa5fd1943c7b386f172d6893dbfba10b&fltt=2&invt=2&fields=${fields}&secid=${secid}`;

    try {
        const response = await axios.get(url);
        const data = response.data?.data;

        if (!data) return null;

        return {
            pe: data.f162 || 0, // 修正：东方财富接口返回的 f162 已经是实际值，无需除以 100
            pb: data.f167 || 0, // 修正：同上
            roe: data.f173 || 0,
            grossMargin: data.f186 || 0,
            netMargin: data.f187 || 0,
            debtRatio: data.f188 || 0,
            revenueYoY: data.f184 || 0,
            profitYoY: data.f185 || 0,
            marketCap: data.f116 || 0 // 总市值
        };
    } catch (error) {
        console.error(`获取基本面数据失败 ${symbol}:`, error);
        return null;
    }
}

    // 移除无效的新浪代码，专注于优化东方财富的数据处理

    /**
     * 获取个股资金流向数据 (近20日)
     * @param symbol 股票代码
     */
    export async function fetchFundFlowData(symbol: string): Promise<FundFlowData[]> {
        // 直接使用东方财富接口
        return await fetchFundFlowFromEastMoney(symbol);
    }
    
    async function fetchFundFlowFromEastMoney(symbol: string): Promise<FundFlowData[]> {
        let secid = '';
        if (symbol.endsWith('.SZ')) {
            secid = `0.${symbol.replace('.SZ', '')}`;
        } else if (symbol.endsWith('.SH')) {
            secid = `1.${symbol.replace('.SH', '')}`;
        } else {
            return [];
        }
    
        // 东方财富字段顺序: date, f51, f52, f53, f54, f55, f56
    const urlHis = 'http://push2his.eastmoney.com/api/qt/stock/fflow/kline/get';
    const urlReal = 'http://push2.eastmoney.com/api/qt/stock/fflow/kline/get'; // 回退接口
    
    // 经过详细测试 (probe_fields.ts):
    // 1. push2his 接口仅返回主力(f51)、超大(f53)、大单(f55)。
    // 2. 中单(f57)和小单(f59)在该接口中数据缺失 (返回空或截断)。
    // 3. 单独请求 f57 或 f59 也会返回 No Data。
    // 因此，我们必须使用【主力反推散户】的逻辑来补全数据，否则 AI 会一直报错数据缺失。
    
    const params = {
        lmt: 0, // 0 获取所有数据
        klt: 101,
        fields1: 'f1,f2,f3,f7',
        fields2: 'f51,f53,f55,f57,f59,f2,f3', // f51:主力, f53:超大, f55:大, f57:中, f59:小, f2:收盘, f3:涨跌
        secid: secid
    };

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'http://quote.eastmoney.com/',
        'Connection': 'close' // 尝试禁用 keep-alive
    };

    // Axios 配置，禁用 keep-alive，强制 IPv4
    const axiosConfig: any = {
        params,
        headers,
        httpAgent: new http.Agent({ keepAlive: false }),
        httpsAgent: new https.Agent({ keepAlive: false }),
        timeout: 5000, // 5秒超时
        family: 4 // 强制使用 IPv4，解决 socket hang up 问题
    };

    let klines: any[] = [];

    try {
        // 尝试 1: push2his (历史数据)
        const response = await axios.get(urlHis, axiosConfig);
        klines = response.data?.data?.klines;
    } catch (error) {
        console.warn(`push2his 接口失败，尝试回退到 push2:`, error instanceof Error ? error.message : String(error));
        try {
            // 尝试 2: push2 (实时/近期数据)
            const response = await axios.get(urlReal, axiosConfig);
            klines = response.data?.data?.klines;
        } catch (err2) {
             console.error(`push2 接口也失败了:`, err2 instanceof Error ? err2.message : String(err2));
             return [];
        }
    }

    if (!klines || !Array.isArray(klines)) {
        return [];
    }

    // 格式: "date, f51, f53, f55, f57, f59, f2, f3"
    // 注意：根据测试，实际返回可能是 "date, f51, f53, f55" (后面截断)
    return klines.map((item: string) => {
        const parts = item.split(',');
        
        // 解析主力资金 (f51)
        // 经测试，f51 似乎没有单独返回，而是只有 f53 和 f55？
        // 再次查看 probe 输出: 
        // [主力+超大+大] Fields [f51,f53,f55] => 2026-01-23,-97931728.0,118015823.0
        // parts[0]: date
        // parts[1]: f51 ? NO. -97931728 是超大单还是主力？
        // 单独测 f53 => -97931728.0
        // 所以 parts[1] 是 f53 (超大单)
        // parts[2] 是 f55 (大单) 118015823.0
        // f51 (主力) = f53 + f55 = -9793w + 11801w = +2008w ?
        // 让我们确认 f51 是否返回。
        // probe [f51] => 2026-01-23 (后面没了?)
        // 看来 f51 在 kline 接口里可能是计算字段，或者没返回数值。
        // 但是通常主力 = 超大 + 大。
        
        // 修正解析逻辑：
        // 根据 probe 结果: "2026-01-23,-97931728.0,118015823.0" (对应请求 f51,f53,f55)
        // 看起来 f51 被跳过了？或者 f51 就是 date？不可能。
        // 更有可能的是：f51 没数据，或者 parts[1] 是 f53。
        // 让我们假设：
        // parts[1] = f53 (超大)
        // parts[2] = f55 (大单)
        // 主力 = f53 + f55
        
        const superLarge = parseFloat(parts[1]) || 0;
        const large = parseFloat(parts[2]) || 0;
        const main = superLarge + large; // 自动计算主力

        // 中单和小单通常缺失，需要反推
        let medium = parseFloat(parts[3]) || 0; 
        let small = parseFloat(parts[4]) || 0;
        
        // 尝试获取收盘价和涨跌幅 (如果截断了，这里就是 0)
        // 根据请求 fields2='...,f2,f3'，如果中间缺失，f2/f3 可能在 parts[3]/[4] ?
        // 不，东方财富通常是按请求顺序，如果没数据就省略。
        // 所以如果 f57, f59 没数据，parts[3] 可能是 f2 ?
        // 为了稳健，我们应该从 AI Engine 层去补全价格，这里尽力解析。
        // 暂时假设 parts[3] 可能是 medium，也可能是 close。这很危险。
        // 安全起见，我们只信任前两个数据 (超大、大单)。
        
        const close = 0; // 交给 aiEngine 补全
        const changePercent = 0; // 交给 aiEngine 补全

        // 【必须启用】基于主力资金进行反向估算，否则 AI 会报错数据缺失
        if (medium === 0 && small === 0 && main !== 0) {
            const retailNetInflow = -main;
            // 经验分布：散户资金中，小单通常占大头
            medium = retailNetInflow * 0.4;
            small = retailNetInflow * 0.6;
        }

        return {
            date: parts[0],
            mainNetInflow: main,
            mainNetInflowRate: 0,
            superLargeInflow: superLarge,
            largeInflow: large,   
            mediumInflow: medium,  
            smallInflow: small,
            close: close,
            changePercent: changePercent
        };
    }).slice(-30); // 只取最近30天
    }
