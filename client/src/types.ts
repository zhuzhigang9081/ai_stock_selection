export interface StockAnalysis {
  analysisMode?: 'postmarket';
  analysisModeLabel?: string;
  analysisDisclaimer?: string;
  symbol?: string;
  stockName: string;
  currentPrice: number;
  changePercent: number;
  turnoverRate?: number; // 换手率
  volumeRatio?: number;  // 量比
  marketSentiment?: string; // 市场情绪/环境
  
  // 核心摘要
  executiveSummary?: {
    oneLineDecision: string;
    coreLogic: string;
    expectedReturn: string;
  };

  diagnosis: {
    score: number;
    advice: string; 
    winRate: number;
    reasoning: string;
    scoreBreakdown?: {
      trend: string;
      volumePrice: string;
      indicators: string;
      fundamental?: string;
      fundFlow?: string;
    };
  };

  // 详细分析
  detailedAnalysis?: {
    technicalAnalysis: DetailedAnalysisSection; // 技术面
    fundamentalAnalysis?: DetailedAnalysisSection; // 基本面
    fundFlowAnalysis?: DetailedAnalysisSection;    // 资金面
    marketAnalysis: DetailedAnalysisSection; // 市场情绪/综合讨论
  };

  // 交易策略 (升级版)
  tradingStrategy?: {
    coreDecision: {
      action: string;
      confidenceLevel: string;
      urgency: string;
      reasoning: string;
    };
    entryPlan: {
      optimalEntry: string;
      alternativeEntry: string;
      entryRationale: string;
      confirmationSignals: string;
    };
    riskManagement: {
      stopLoss: {
        price: string; // Changed from number to string to support text descriptions
        reason: string;
        riskPercentage: string;
        riskAmount: string;
      };
      positionSizing: {
        suggestedSize: string;
        calculationBasis: string;
        maxPosition: string;
      };
    };
    profitTaking: {
      target1: ProfitTarget;
      target2: ProfitTarget;
      trailingStop: string;
    };
  };

  // 情景分析
  scenarioAnalysis?: {
    bullCase: ScenarioCase;
    baseCase: ScenarioCase;
    bearCase: ScenarioCase;
  };

  // 监控计划
  monitoringPlan?: {
    keyLevelsToWatch: Array<{ level: string; significance: string; actionIfBreak: string }>;
    indicatorsToTrack: Array<{ indicator: string; threshold: string; signalType: string }>;
    nextReviewTime: string;
    exitTriggers: Array<{ condition: string; action: string }>;
  };

  // 绩效指标
  performanceMetrics?: {
    estimatedWinRate: string;
    riskRewardRatio: string;
    sharpeRatio: string;
    maximumDrawdown: string;
    holdingPeriod: string;
  };

  // 教育洞察
  educationalInsights?: {
    lessonFromThisCase: string;
    commonMistakesToAvoid: string;
    patternRecognition: string;
  };

  dataQuality?: {
    snapshot?: DataQualityMeta;
    history?: DataQualityMeta;
    financial?: DataQualityMeta | null;
    fundFlow?: {
      summary: DataQualityMeta | null;
      missingDays: number;
    };
  };

  continuity?: {
    previousReport?: ReportContinuitySummary | null;
    continuityNote?: string;
  };

  // 兼容旧字段
  levels: {
    entry: number;
    add: number;
    target: number;
    stopLoss: number;
  };
  tradePlan?: any; // Deprecated
  profitMetrics?: any; // Deprecated
  commodityLink?: { 
    name: string;
    price: string;
    impact: 'positive' | 'negative' | 'neutral';
  };
}

// 辅助接口定义
export interface DetailedAnalysisSection {
  score: number;
  detailedReason: string;
  riskAssessment: string;
}

export interface ProfitTarget {
  price: string; // Changed from number to string
  probability: string;
  rationale: string;
  action: string;
}

export interface ScenarioCase {
  probability: string;
  triggerConditions?: string;
  priceTarget?: string;
  timeFrame?: string;
  expectedReturn?: string;
  riskFactors?: string;
  worstCasePrice?: string;
  damageControl?: string;
}

export interface DataQualityMeta {
  source: string;
  endpoint: string;
  tier: 'primary' | 'fallback' | 'cache';
  fetchedAt: string;
  asOf?: string;
  cacheHit: boolean;
  stale: boolean;
  isEstimated: boolean;
  qualityScore: number;
  qualityLevel: 'high' | 'medium' | 'low';
  issues: string[];
}

export interface ReportContinuitySummary {
  timestamp: number;
  stockName: string;
  symbol: string;
  score: number;
  advice: string;
  oneLineDecision?: string;
  currentPrice?: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
  reasoning?: string;
}

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
