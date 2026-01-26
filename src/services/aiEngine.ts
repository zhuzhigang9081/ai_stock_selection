import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { config } from '../config';
import { StockSnapshot, StockHistory, FinancialData, FundFlowData } from './dataService';

const openai = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: config.deepseekBaseUrl,
});

// 保存财务数据到 CSV
function saveFinancialDataToCsv(symbol: string, financial: FinancialData) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = path.join(dataDir, `financial_${symbol}.csv`);

    // 定义表头 (key) 和中文含义
    const headers = [
        { key: 'pe', label: '市盈率(PE)' },
        { key: 'pb', label: '市净率(PB)' },
        { key: 'roe', label: '净资产收益率(ROE)' },
        { key: 'grossMargin', label: '毛利率' },
        { key: 'netMargin', label: '净利率' },
        { key: 'debtRatio', label: '资产负债率' },
        { key: 'revenueYoY', label: '营收同比增长' },
        { key: 'profitYoY', label: '净利润同比增长' },
        { key: 'marketCap', label: '总市值' }
    ];

    // 构建 CSV 内容
    // 第一行：中文表头
    // 第二行：数据值
    const headerRow = headers.map(h => h.label).join(',');
    const valueRow = headers.map(h => financial[h.key as keyof FinancialData] || 'N/A').join(',');
    
    // 如果想要竖向表格 (Key, Value)，可以用这种格式：
    // 指标,数值
    // 市盈率(PE), 10.5
    // ...
    // 但通常数据表是横向的。根据用户需求 "表格 (key值增加 中文)"，
    // 可能是指一个映射表，或者只是保存数据。这里生成横向 CSV，并在第一行包含中文。

    const csvContent = `\uFEFF${headerRow}\n${valueRow}`; // 添加 BOM 以防乱码

    try {
        fs.writeFileSync(filePath, csvContent, 'utf-8');
        console.log(`财务数据已保存到 ${filePath}`);
    } catch (e) {
        console.error(`保存财务数据失败:`, e);
    }
}

// 技术分析提示词
const TECHNICAL_ANALYSIS_PROMPT = `
你是一名资深的技术分析师。请基于以下股票数据进行专业的技术面分析：

股票信息：
- 股票代码：\${symbol}
- 股票名称：\${name}
- 当前价格：\${currentPrice}
- 涨跌幅：\${changePercent}%

最新技术指标：
- 收盘价：\${price}
- MA5：\${ma5}
- MA10：\${ma10}
- MA20：\${ma20}
- MA60：\${ma60}
- RSI：\${rsi}
- MACD：\${macd}
- MACD信号线：\${macdSignal}
- 布林带上轨：\${bbUpper}
- 布林带下轨：\${bbLower}
- K值：\${kValue}
- D值：\${dValue}
- 量比：\${volumeRatio}

请从以下角度进行分析：
1. 趋势分析（均线系统、价格走势）
2. 超买超卖分析（RSI、KDJ）
3. 动量分析（MACD）
4. 支撑阻力分析（布林带）
5. 成交量分析
6. 短期、中期、长期技术判断
7. 关键技术位分析

请给出专业、详细的技术分析报告，包含风险提示。
重要：请不要使用Markdown格式（如**粗体**、## 标题等），直接输出纯文本，使用简单的序号（1. 2. 3.）或缩进即可。保持段落清晰。
`;
// 基本面分析提示词
const FUNDAMENTAL_ANALYSIS_PROMPT = `
你是一名资深的基本面分析师，拥有CFA资格和10年以上的证券分析经验。请基于以下详细信息进行深入的基本面分析：

【基本信息】
- 股票代码：\${symbol}
- 股票名称：\${name}
- 当前价格：\${currentPrice}
- 市值：\${marketCap}
- 行业：\${sector}

【估值指标】
- 市盈率(PE)：\${pe}
- 市净率(PB)：\${pb}
- ROE：\${roe}
- 毛利率：\${grossMargin}
- 净利率：\${netMargin}
- 资产负债率：\${debtRatio}
- 营收同比增长：\${revenueYoY}
- 净利润同比增长：\${profitYoY}

请从以下维度进行专业、深入的分析：

1. 公司质地分析
   - 业务模式和核心竞争力
   - 行业地位和市场份额
   - 护城河分析（品牌、技术、规模等）

2. 盈利能力分析
   - ROE和ROA水平评估
   - 毛利率和净利率趋势
   - 与行业平均水平对比
   - 盈利质量和持续性

3. 财务健康度分析
   - 资产负债结构
   - 偿债能力评估
   - 现金流状况
   - 财务风险识别

4. 成长性分析
   - 收入和利润增长趋势
   - 增长驱动因素
   - 未来成长空间
   - 行业发展前景

5. 估值分析
   - 当前估值水平（PE、PB）
   - 历史估值区间对比
   - 行业估值对比
   - 合理估值区间判断

6. 投资价值判断
   - 综合评分（0-100分）
   - 投资亮点
   - 投资风险
   - 适合的投资者类型

请给出专业、详细的基本面分析报告。
重要：请不要使用Markdown格式（如**粗体**、## 标题等），直接输出纯文本，使用简单的序号（1. 2. 3.）或缩进即可。保持段落清晰。
`;
// 资金流向分析提示词
const FUND_FLOW_ANALYSIS_PROMPT = `
你是一名资深的资金面分析师，擅长从资金流向数据中洞察主力行为和市场趋势。

【基本信息】
- 股票代码：\${symbol}
- 股票名称：\${name}
- 当前价格：\${currentPrice}

【技术指标】
- 量比：\${volumeRatio}
- 换手率：\${turnoverRate}

\${fundFlowSection}

【分析要求】

请你**基于上述近20个交易日的完整资金流向数据**，从以下角度进行深入分析：

1. 资金流向趋势分析 ⭐ 重点
   - 分析近20个交易日主力资金的累计净流入/净流出
   - 识别资金流向的趋势性特征（持续流入、持续流出、震荡）
   - 计算主力资金净流入天数占比
   - 评估资金流向强度（累计金额、平均每日金额）

2. 主力资金行为分析 ⭐ 核心重点
   - 主力资金总体表现：累计净流入金额、占比、趋势方向
   - 超大单分析：机构大资金的进出动作
   - 大单分析：主力资金的操作特征
   - 主力操作意图研判：
     * 吸筹建仓：持续净流入 + 股价上涨/盘整
     * 派发出货：持续净流出 + 股价下跌/高位
     * 洗盘整理：震荡流入流出 + 股价调整
     * 拉升推动：集中大额流入 + 股价快速上涨

3. 散户资金行为分析
   - 中单、小单的动向：散户的买卖情绪
   - 主力与散户博弈：
     * 主力流入、散户流出 → 专业资金吸筹
     * 主力流出、散户流入 → 高位接盘风险
     * 同向流动 → 趋势明确
   - 散户参与度和情绪判断

4. 量价配合分析
   - 资金流向与股价涨跌的配合度
   - 识别量价背离：
     * 价涨量缩 + 资金流出 → 警惕顶部
     * 价跌量增 + 资金流入 → 可能见底
   - 成交活跃度变化趋势

5. 关键信号识别
   - 买入信号：
     * 主力持续净流入
     * 大单明显流入
     * 资金流入 + 股价上涨
   - 卖出信号：
     * 主力持续净流出
     * 大额资金出逃
     * 资金流出 + 股价滞涨或下跌
   - 观望信号：
     * 资金流向不明确
     * 主力与散户博弈激烈

6. 投资建议
   - 基于资金面的明确操作建议
   - 买入/持有/卖出的判断依据
   - 仓位管理建议

【分析原则】
- 主力资金持续流入 + 股价上涨 → 强势信号，主力看好
- 主力资金流出 + 股价上涨 → 警惕信号，可能是散户接盘
- 主力资金流入 + 股价下跌 → 可能是主力低位吸筹
- 主力资金流出 + 股价下跌 → 弱势信号，主力看空
- 注意区分短期波动与趋势性变化

请给出专业、详细、有深度的资金面分析报告。记住：要基于问财数据的实际内容进行分析，而不是假设！
重要：请不要使用Markdown格式（如**粗体**、## 标题等），直接输出纯文本，使用简单的序号（1. 2. 3.）或缩进即可。保持段落清晰。
`;

const COMPREHENSIVE_DISCUSSION_PROMPT = `
现在需要进行一场投资决策会议，你作为首席分析师，需要综合各位分析师的报告进行讨论。

股票基本信息：
- 股票代码：\${symbol}
- 股票名称：\${name}
- 当前价格：\${currentPrice}

【用户个人观点】
用户（投资者）提供了以下主观判断：" \${userOpinion} "
**权重说明**：请将此观点的权重设为 **10%**。这意味着：
1. 当技术/基本/资金面分析出现分歧或方向不明确时，用户的观点应成为决定性因素。
2. 当客观数据与用户观点完全相反且证据确凿时，应坚持客观数据，但需在风险提示中回应用户的担忧。
3. 如果用户观点为空，请忽略此项。

技术面分析报告：
\${technicalReport}

基本面分析报告：
\${fundamentalReport}

资金面分析报告：
\${fundFlowReport}

请作为首席分析师，综合以上三个维度的分析报告，进行深入讨论：

1. 各个分析维度的一致性和分歧点
2. 不同分析结论的权重考量
3. 当前市场环境下的投资逻辑
4. 潜在风险和机会识别
5. 不同投资周期的考量（短期、中期、长期）
6. 市场情绪和预期管理
7. **用户观点的考量**：明确指出是否采纳了用户的观点，以及原因。

请模拟一场专业的投资讨论会议，体现不同观点的碰撞和融合。
重要：请不要使用Markdown格式（如**粗体**、## 标题等），直接输出纯文本，使用简单的序号（1. 2. 3.）或缩进即可。保持段落清晰。
`;
// 最终决策提示词
const FINAL_DECISION_PROMPT = `
基于前期的综合分析讨论，现在需要做出最终的投资决策。

股票信息：
- 股票代码：\${symbol}
- 股票名称：\${name}
- 当前价格：\${currentPrice}

【用户个人观点】
用户（投资者）提供了以下主观判断：" \${userOpinion} "
(权重说明：10%权重，作为倾向性参考)

综合分析讨论结果：
\${comprehensiveDiscussion}

当前关键技术位：
- MA20：\${ma20}
- 布林带上轨：\${bbUpper}
- 布林带下轨：\${bbLower}

请给出最终投资决策，必须包含以下内容：

1. 投资评级：买入/持有/卖出
2. 目标价位（具体数字）
3. 操作建议（具体的买入/卖出策略）
4. 进场位置（具体价位区间）
5. 止盈位置（具体价位）
6. 止损位置（具体价位）
7. 持有周期建议
8. 风险提示
9. 仓位建议（轻仓/中等仓位/重仓）
10. 绩效预估（盈亏比、夏普比率、最大回撤）
12. 情景推演（乐观、中性、悲观情景的概率、目标价及条件）

请以JSON格式输出决策结果，格式如下：
{
    "rating": "买入/持有/卖出",
    "target_price": "目标价位数字",
    "operation_advice": "具体操作建议",
    "entry_range": "进场价位区间",
    "take_profit": "止盈价位",
    "stop_loss": "止损价位",
    "holding_period": "持有周期",
    "position_size": "仓位建议",
    "risk_warning": "风险提示",
    "confidence_level": "信心度(1-10分)",
    "risk_reward_ratio": "预估盈亏比(如 1:2)",
    "sharpe_ratio": "预估夏普比率(如 1.5)",
    "max_drawdown": "预估最大回撤(如 5%)",
    "risk_percentage": "单笔风险百分比 (如 2%)",
    "alternative_entry": "备选进场位",
    "key_levels_to_watch": [
        {"level": "价格", "significance": "说明", "actionIfBreak": "对策"}
    ],
    "exit_triggers": [
        {"condition": "触发条件", "action": "执行动作"}
    ],
    "scenario_analysis": {
        "bull_case": { "probability": "30%", "target": "价格", "condition": "触发条件" },
        "base_case": { "probability": "50%", "target": "价格", "condition": "触发条件" },
        "bear_case": { "probability": "20%", "target": "价格", "condition": "触发条件" }
    }
}
`;

// 调用 OpenAI 的辅助函数
async function callOpenAI(messages: any[], model: string = 'deepseek-chat', temperature: number = 0.4, max_tokens: number = 2000) {
    // 检查是否为推理模型（如 o1 或 deepseek-reasoner）
    if (model.toLowerCase().includes('reasoner')) {
        max_tokens = 8000;
    }
    
    try {
        const response = await openai.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens,
        });
        
        return response.choices[0].message.content || "无响应";
    } catch (error) {
        console.error("AI 调用失败:", error);
        return "AI调用失败";
    }
}

// 从文本中提取 JSON 的辅助函数
function extractJSON(text: string): any {
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return null;
    } catch (e) {
        return null;
    }
}

// 移除 Markdown 格式的辅助函数
function cleanMarkdown(text: string): string {
    if (!text) return "";
    return text
        .replace(/\*\*/g, "") // 移除粗体
        .replace(/###\s/g, "")   // 移除三级标题
        .replace(/##\s/g, "")    // 移除二级标题
        .replace(/#\s/g, "")     // 移除一级标题
        .replace(/`/g, "")    // 移除代码块符号
        .trim();
}

export interface AIAnalysisResult {
    score: number;
    advice: string;
    winRate: number;
    reasoning?: string;
    // 市场统计
    turnoverRate?: number;
    volumeRatio?: number;
    marketSentiment?: string;
    
    scoreBreakdown?: {
      trend: string;
      volumePrice: string;
      indicators: string;
      fundamental?: string;
      fundFlow?: string;
    };
    levels: {
      entry: number;
      add: number;
      target: number;
      stopLoss: number;
    };
    // 前端展示的详细部分
    executiveSummary?: any;
    detailedAnalysis?: any;
    tradingStrategy?: any;
    scenarioAnalysis?: any;
    monitoringPlan?: any;
    performanceMetrics?: any;
    educationalInsights?: any;
    
    // 已弃用但保留以兼容
    tradePlan?: any;
    profitMetrics?: any;
}
  
export interface AIInput {
    stockName: string;
    snapshot: StockSnapshot;
    history: StockHistory;
    financial?: FinancialData | null;
    fundFlow?: FundFlowData[];
    industryInfo?: {
      name: string;
      isTopRanked: boolean;
      rankText: string;
    };
}

export async function analyzeStock(input: AIInput): Promise<AIAnalysisResult> {
    const { snapshot, history, stockName, industryInfo, financial, fundFlow } = input;
    const currentPrice = snapshot.price;

    // 保存财务数据到本地文件 (如果存在)
    //暂时禁用：如需启用，请取消代码注释
    // if (financial) {
    //     saveFinancialDataToCsv(snapshot.symbol, financial);
    // }

    // 读取用户观点
    let userOpinion = "";
    try {
        const opinionPath = path.join(process.cwd(), 'user_opinion.txt');
        if (fs.existsSync(opinionPath)) {
            userOpinion = fs.readFileSync(opinionPath, 'utf-8').trim();
            // 过滤掉注释行
            userOpinion = userOpinion.split('\n').filter(line => !line.startsWith('#')).join(' ').trim();
        }
    } catch (e) {
        console.warn("读取用户观点文件失败:", e);
    }

    if (userOpinion) {
        console.log(`[AI Engine] 采纳用户观点: "${userOpinion}"`);
    }

    // 1. 准备提示词数据
    const stockInfoMap = {
        symbol: snapshot.symbol,
        name: stockName,
        currentPrice: currentPrice,
        changePercent: snapshot.changePercent,
        marketCap: financial?.marketCap ? (financial.marketCap / 100000000).toFixed(2) + '亿' : 'N/A', // 转换为亿元
        sector: industryInfo?.name || '未知',
        pe: financial?.pe || 'N/A',
        pb: financial?.pb || 'N/A',
        roe: financial?.roe || 'N/A',
        grossMargin: financial?.grossMargin || 'N/A',
        netMargin: financial?.netMargin || 'N/A',
        debtRatio: financial?.debtRatio || 'N/A',
        revenueYoY: financial?.revenueYoY || 'N/A',
        profitYoY: financial?.profitYoY || 'N/A',
    };

    const indicatorsMap = {
        price: history.klines[history.klines.length - 1].close,
        ma5: history.ma5,
        ma10: history.ma10,
        ma20: history.ma20,
        ma60: history.ma60,
        rsi: history.rsi,
        macd: history.macd?.macd,
        macdSignal: history.macd?.dea,
        bbUpper: history.boll?.upper,
        bbLower: history.boll?.lower,
        kValue: history.kdj?.k,
        dValue: history.kdj?.d,
        volumeRatio: snapshot.volumeRatio,
        turnoverRate: snapshot.turnoverRate
    };

    // 准备资金流向部分
    let fundFlowSection = "\n【资金流向数据】\n注意：未能获取到资金流向数据，将基于成交量进行分析。\n";
    if (fundFlow && fundFlow.length > 0) {
        // 按日期升序排序以显示趋势
        const sortedFlow = [...fundFlow].sort((a, b) => a.date.localeCompare(b.date));
        
        // 构建日期到 K 线数据的映射，用于回退价格信息
        const klineMap = new Map<string, { close: number, changePercent: number }>();
        history.klines.forEach((k, index) => {
            const prevClose = index > 0 ? history.klines[index - 1].close : k.open;
            const change = ((k.close - prevClose) / prevClose) * 100;
            klineMap.set(k.date, { close: k.close, changePercent: change });
        });

        const recentFlow = sortedFlow.map(f => {
            const unit = 10000;
            // 如果中单/小单为0，提示数据缺失
            const mediumText = f.mediumInflow === 0 ? "数据缺失" : `${(f.mediumInflow/unit).toFixed(0)}万`;
            const smallText = f.smallInflow === 0 ? "数据缺失" : `${(f.smallInflow/unit).toFixed(0)}万`;
            
            // 优先使用 fundFlow 中的价格，如果缺失(0)则使用 history 中的 K 线数据
            let closePrice = f.close;
            let changePct = f.changePercent;
            
            if (closePrice === 0) {
                const klineData = klineMap.get(f.date);
                if (klineData) {
                    closePrice = klineData.close;
                    changePct = klineData.changePercent;
                }
            }
            
            const priceInfo = closePrice !== 0 ? `收盘:${closePrice}(${changePct.toFixed(2)}%)` : "价格未知";
            
            return `日期:${f.date}, ${priceInfo}, 主力:${(f.mainNetInflow/unit).toFixed(0)}万(${f.mainNetInflowRate}%), 超大:${(f.superLargeInflow/unit).toFixed(0)}万, 大单:${(f.largeInflow/unit).toFixed(0)}万, 中单:${mediumText}, 小单:${smallText}`;
        }).join('\n');
        
        fundFlowSection = `\n【近${sortedFlow.length}个交易日资金流向详细数据】\n${recentFlow}\n注意：请重点关注主力资金（超大单+大单）与股价涨跌的背离/协同关系。\n`;
    }

    // 2. 运行分析智能体 (并行)
    console.log("开始多智能体分析...");

    // 替换提示词中的占位符
    const replacePlaceholders = (prompt: string, map: any) => {
        let p = prompt;
        for (const key in map) {
            p = p.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(map[key]));
        }
        return p;
    };

    const techPrompt = replacePlaceholders(TECHNICAL_ANALYSIS_PROMPT, { ...stockInfoMap, ...indicatorsMap });
    const fundPrompt = replacePlaceholders(FUNDAMENTAL_ANALYSIS_PROMPT, stockInfoMap);
    const flowPrompt = replacePlaceholders(FUND_FLOW_ANALYSIS_PROMPT, { ...stockInfoMap, ...indicatorsMap, fundFlowSection });

    const [techReportRaw, fundReportRaw, flowReportRaw] = await Promise.all([
        callOpenAI([{ role: "system", content: "你是一名经验丰富的股票技术分析师。" }, { role: "user", content: techPrompt }]),
        callOpenAI([{ role: "system", content: "你是一名经验丰富的股票基本面分析师。" }, { role: "user", content: fundPrompt }]),
        callOpenAI([{ role: "system", content: "你是一名经验丰富的资金面分析师。" }, { role: "user", content: flowPrompt }]),
    ]);

    const techReport = cleanMarkdown(techReportRaw);
    const fundReport = cleanMarkdown(fundReportRaw);
    const flowReport = cleanMarkdown(flowReportRaw);

    console.log("智能体分析完成。");

    // 3. 运行首席分析师 (综合讨论)
    const discussPrompt = replacePlaceholders(COMPREHENSIVE_DISCUSSION_PROMPT, {
        ...stockInfoMap,
        technicalReport: techReport,
        fundamentalReport: fundReport,
        fundFlowReport: flowReport,
        userOpinion: userOpinion || "（用户未提供个人观点）"
    });

    console.log("首席分析师正在讨论...");
    const discussionRaw = await callOpenAI(
        [{ role: "system", content: "你是一名资深的首席投资分析师。" }, { role: "user", content: discussPrompt }],
        'deepseek-chat', 0.7, 6000
    );
    const discussion = cleanMarkdown(discussionRaw);

    // 4. 运行最终决策者
    const decisionPrompt = replacePlaceholders(FINAL_DECISION_PROMPT, {
        ...stockInfoMap,
        ...indicatorsMap,
        comprehensiveDiscussion: discussion,
        userOpinion: userOpinion || "（用户未提供个人观点）"
    });

    console.log("正在做出最终决策...");
    const decisionText = await callOpenAI(
        [{ role: "system", content: "你是一名专业的投资决策专家。" }, { role: "user", content: decisionPrompt }],
        'deepseek-reasoner', 0.3
    );

    // 5. 解析结果并映射到前端结构
    const decisionJson = extractJSON(decisionText) || {};
    console.log("最终决策 JSON 已生成");

    // 如果缺失，计算风险百分比
    let riskPercentage = decisionJson.risk_percentage;
    if (!riskPercentage || riskPercentage === "N/A") {
         const entryPrice = parseFloat(String(decisionJson.entry_range?.split('-')[0] || currentPrice).replace(/[^0-9.]/g, ''));
         const stopPrice = parseFloat(String(decisionJson.stop_loss || currentPrice).replace(/[^0-9.]/g, ''));
         if (entryPrice && stopPrice && entryPrice !== 0) {
             riskPercentage = ((entryPrice - stopPrice) / entryPrice * 100).toFixed(2) + "%";
         } else {
             riskPercentage = "N/A";
         }
    }

    // 映射到前端结构
    const result: AIAnalysisResult = {
        score: parseFloat(decisionJson.confidence_level || "5") * 10, // 1-10 -> 10-100
        advice: decisionJson.rating || "观望",
        winRate: parseFloat(decisionJson.confidence_level || "0") / 10,
        reasoning: decisionJson.operation_advice || "请参考详细分析报告",
        
        // 直接传递市场统计数据
        turnoverRate: snapshot.turnoverRate,
        volumeRatio: snapshot.volumeRatio,
        marketSentiment: snapshot.marketSentiment,
        
        scoreBreakdown: {
            trend: "详见技术面分析报告",
            volumePrice: "详见资金面分析报告",
            indicators: "详见技术面分析报告",
            fundamental: "详见基本面分析报告",
            fundFlow: "详见资金面分析报告"
        },

        levels: {
            entry: parseFloat(String(decisionJson.entry_range?.split('-')[0] || currentPrice).replace(/[^0-9.]/g, '')),
            add: 0,
            target: parseFloat(String(decisionJson.target_price || currentPrice).replace(/[^0-9.]/g, '')),
            stopLoss: parseFloat(String(decisionJson.stop_loss || currentPrice).replace(/[^0-9.]/g, ''))
        },

        executiveSummary: {
            oneLineDecision: `${decisionJson.rating}: ${decisionJson.operation_advice}`,
            coreLogic: "基于多智能体（技术面、基本面、资金面）的综合研判",
            expectedReturn: `目标价: ${decisionJson.target_price}`
        },

        detailedAnalysis: {
            technicalAnalysis: {
                score: 0,
                detailedReason: techReport,
                riskAssessment: "详见技术分析报告"
            },
            fundamentalAnalysis: {
                score: 0,
                detailedReason: fundReport,
                riskAssessment: "详见基本面分析报告"
            },
            fundFlowAnalysis: {
                score: 0,
                detailedReason: flowReport,
                riskAssessment: "详见资金面分析报告"
            },
            marketAnalysis: {
                score: 0,
                detailedReason: discussion, 
                riskAssessment: decisionJson.risk_warning
            }
        },

        tradingStrategy: {
            coreDecision: {
                action: decisionJson.rating,
                confidenceLevel: decisionJson.confidence_level + "/10",
                urgency: "请结合盘面",
                reasoning: decisionJson.operation_advice
            },
            entryPlan: {
                optimalEntry: decisionJson.entry_range,
                alternativeEntry: decisionJson.alternative_entry || "观望等待", // 提供默认值
                entryRationale: "基于综合分析决策",
                confirmationSignals: "详见技术分析"
            },
            riskManagement: {
                stopLoss: {
                    price: decisionJson.stop_loss,
                    reason: "风控位",
                    riskPercentage: riskPercentage, // 使用计算或映射的值
                    riskAmount: "N/A"
                },
                positionSizing: {
                    suggestedSize: decisionJson.position_size,
                    calculationBasis: "风险评估",
                    maxPosition: "N/A"
                }
            },
            profitTaking: {
                target1: {
                    price: decisionJson.target_price,
                    probability: "N/A",
                    rationale: "目标位",
                    action: "止盈"
                },
                target2: {
                    price: 0,
                    probability: "",
                    rationale: "",
                    action: ""
                },
                trailingStop: "建议设置移动止损"
            }
        },
        
        // 用占位符或映射数据填充其他必填字段
        scenarioAnalysis: {
            bullCase: { 
                probability: decisionJson.scenario_analysis?.bull_case?.probability || "N/A", 
                priceTarget: decisionJson.scenario_analysis?.bull_case?.target || "N/A", 
                triggerConditions: decisionJson.scenario_analysis?.bull_case?.condition || "N/A" 
            },
            baseCase: { 
                probability: decisionJson.scenario_analysis?.base_case?.probability || "N/A", 
                priceTarget: decisionJson.scenario_analysis?.base_case?.target || decisionJson.target_price, 
                triggerConditions: decisionJson.scenario_analysis?.base_case?.condition || "N/A"
            },
            bearCase: { 
                probability: decisionJson.scenario_analysis?.bear_case?.probability || "N/A", 
                worstCasePrice: decisionJson.scenario_analysis?.bear_case?.target || decisionJson.stop_loss, 
                riskFactors: decisionJson.scenario_analysis?.bear_case?.condition || decisionJson.risk_warning 
            }
        },
        monitoringPlan: {
            keyLevelsToWatch: decisionJson.key_levels_to_watch || [],
            indicatorsToTrack: [],
            nextReviewTime: decisionJson.holding_period,
            exitTriggers: decisionJson.exit_triggers || []
        },
        performanceMetrics: {
            estimatedWinRate: (parseFloat(decisionJson.confidence_level || "0") / 10).toFixed(2),
            riskRewardRatio: decisionJson.risk_reward_ratio || "N/A",
            sharpeRatio: decisionJson.sharpe_ratio || "N/A",
            maximumDrawdown: decisionJson.max_drawdown || "N/A",
            holdingPeriod: decisionJson.holding_period
        },
        educationalInsights: {
            lessonFromThisCase: "多维度分析的重要性",
            commonMistakesToAvoid: decisionJson.risk_warning,
            patternRecognition: "综合形态识别"
        }
    };

    return result;
}
