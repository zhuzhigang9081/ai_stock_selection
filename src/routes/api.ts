import { Router, Request, Response } from 'express';
import { fetchStockSnapshot, fetchStockHistory, searchStocks, fetchStockSector, fetchIndustryRank, fetchFinancialData, fetchFundFlowData, StockSnapshot } from '../services/dataService';
import { analyzeStock } from '../services/aiEngine';

import { getHistory, addHistory } from '../services/historyService';

const router = Router();

/**
 * @swagger
 * /api/history:
 *   get:
 *     summary: 获取诊断历史
 *     description: 获取最近的 50 条 AI 诊断记录
 *     responses:
 *       200:
 *         description: 成功返回历史列表
 */
router.get('/history', (req: Request, res: Response) => {
  const history = getHistory();
  res.json(history);
});

/**
 * @swagger
 * /api/stock/search:
 *   get:
 *     summary: 股票模糊搜索
 *     description: 根据输入的关键词（代码、名称或拼音）搜索股票。
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: true
 *         description: 搜索关键词，例如 "000933", "神火", "shenhuo"
 *     responses:
 *       200:
 *         description: 成功返回匹配的股票列表
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   symbol:
 *                     type: string
 *                     example: "000933.SZ"
 *                   name:
 *                     type: string
 *                     example: "神火股份"
 *       400:
 *         description: 缺少查询参数
 *       500:
 *         description: 服务器内部错误
 */
// 新增：股票搜索接口
router.get('/stock/search', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter "q"' });
  }

  try {
    const results = await searchStocks(query);
    res.json(results);
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/stock/diagnosis/{code}:
 *   get:
 *     summary: AI 选股诊断
 *     description: 获取指定股票的实时行情、技术指标、基本面数据和资金流向，并调用 DeepSeek 进行 AI 投资分析。
 *     parameters:
 *       - in: path
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: 股票代码，例如 "000933.SZ" (深市) 或 "600519.SH" (沪市)
 *     responses:
 *       200:
 *         description: 成功返回诊断报告
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stockName:
 *                   type: string
 *                   description: 股票名称
 *                   example: "神火股份"
 *                 currentPrice:
 *                   type: number
 *                   description: 当前价格
 *                   example: 17.58
 *                 changePercent:
 *                   type: number
 *                   description: 涨跌幅 (%)
 *                   example: 2.35
 *                 turnoverRate:
 *                   type: number
 *                   description: 换手率 (%)
 *                   example: 3.5
 *                 volumeRatio:
 *                   type: number
 *                   description: 量比
 *                   example: 1.2
 *                 marketSentiment:
 *                   type: string
 *                   description: 市场情绪
 *                   example: "多头"
 *                 executiveSummary:
 *                   type: object
 *                   description: 核心摘要
 *                   properties:
 *                     oneLineDecision:
 *                       type: string
 *                       description: 一句话决策
 *                     coreLogic:
 *                       type: string
 *                       description: 核心逻辑
 *                     expectedReturn:
 *                       type: string
 *                       description: 预期收益
 *                 diagnosis:
 *                   type: object
 *                   description: 诊断总览
 *                   properties:
 *                     score:
 *                       type: number
 *                       description: AI 评分 (0-100)
 *                       example: 85
 *                     advice:
 *                       type: string
 *                       description: 投资建议 (买入/持有/卖出)
 *                       example: "买入"
 *                     winRate:
 *                       type: number
 *                       description: 预估胜率 (0-1)
 *                       example: 0.75
 *                     reasoning:
 *                       type: string
 *                       description: 简要理由
 *                 tradingStrategy:
 *                   type: object
 *                   description: 交易策略详情
 *                   properties:
 *                     entryPlan:
 *                       type: object
 *                       description: 入场计划
 *                     riskManagement:
 *                       type: object
 *                       description: 风控计划 (止损、仓位)
 *                     profitTaking:
 *                       type: object
 *                       description: 止盈计划
 *                 detailedAnalysis:
 *                   type: object
 *                   description: 各维度详细分析 (技术、基本、资金、市场)
 *                 scenarioAnalysis:
 *                   type: object
 *                   description: 情景推演 (乐观、中性、悲观)
 *                 monitoringPlan:
 *                   type: object
 *                   description: 监控计划 (关键位、触发器)
 *                 performanceMetrics:
 *                   type: object
 *                   description: 绩效指标 (盈亏比、夏普率、回撤)
 *                 educationalInsights:
 *                   type: object
 *                   description: 教育洞察
 *       500:
 *         description: 服务器内部错误
 */
router.get('/stock/diagnosis/:code', async (req: Request, res: Response) => {
  const code = req.params.code as string;
  
  try {
    console.log(`正在分析股票: ${code}`);

    // 使用腾讯和东方财富接口获取数据
    console.log('正在从腾讯和东方财富获取股票数据...');
    
    // 并行获取：快照、K线、行业名称、行业排行、基本面数据、资金流向
    const [snapshot, history, sectorName, industryRankList, financial, fundFlow] = await Promise.all([
      fetchStockSnapshot(code),
      fetchStockHistory(code),
      fetchStockSector(code),
      fetchIndustryRank(20), // 获取前20名
      fetchFinancialData(code),
      fetchFundFlowData(code)
    ]);

    console.log('快照已获取:', snapshot);
    console.log('行业:', sectorName);
    console.log('财务数据:', financial ? '已加载' : '空');
    console.log('资金流向数据:', fundFlow.length > 0 ? `已加载 ${fundFlow.length} 条记录` : '空');

    // 计算行业排名逻辑
    let industryInfo = {
        name: sectorName,
        isTopRanked: false,
        rankText: '未上榜'
    };

    if (sectorName && sectorName !== '未知行业') {
        const rankIndex = industryRankList.findIndex(item => item.name === sectorName);
        if (rankIndex !== -1) {
            // 在前20名列表中找到
            industryInfo.isTopRanked = true;
            industryInfo.rankText = `行业排名第 ${rankIndex + 1}`;
        } else {
             // 未在前20名中找到
             industryInfo.isTopRanked = false;
             industryInfo.rankText = '行业表现一般 (未入前20)';
        }
    }

    // 调用 AI 决策
    const aiResult = await analyzeStock({
      stockName: snapshot.name || code, 
      snapshot,
      history,
      industryInfo,
      financial,
      fundFlow
    });

    // 组装返回结果
    const responseData = {
      stockName: snapshot.name || code,
      currentPrice: snapshot.price,
      changePercent: snapshot.changePercent, // 透传涨跌幅
      turnoverRate: snapshot.turnoverRate, // 透传换手率
      volumeRatio: snapshot.volumeRatio,   // 透传量比
      marketSentiment: snapshot.marketSentiment, // 透传市场环境

      // 核心摘要
      executiveSummary: aiResult.executiveSummary,
      diagnosis: {
        score: aiResult.score,
        advice: aiResult.advice,
        winRate: aiResult.winRate,
        reasoning: aiResult.reasoning,
        scoreBreakdown: aiResult.scoreBreakdown
      },
      // 详细分析
      detailedAnalysis: aiResult.detailedAnalysis,
      // 交易策略
      tradingStrategy: aiResult.tradingStrategy,
      // 情景分析
      scenarioAnalysis: aiResult.scenarioAnalysis,
      // 监控计划
      monitoringPlan: aiResult.monitoringPlan,
      // 绩效指标
      performanceMetrics: aiResult.performanceMetrics,
      // 教育洞察
      educationalInsights: aiResult.educationalInsights,
      
      // 兼容旧字段
      levels: aiResult.levels,
      tradePlan: aiResult.tradePlan,
      profitMetrics: aiResult.profitMetrics
    };

    // 保存到历史记录
    addHistory({
        stockName: snapshot.name || code,
        symbol: code,
        score: aiResult.score,
        advice: aiResult.advice,
        fullData: responseData // 保存完整的分析结果
    });

    res.json(responseData);

  } catch (error) {
    console.error('处理诊断请求时出错:', error);
    res.status(500).json({ error: '服务器内部错误', details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
