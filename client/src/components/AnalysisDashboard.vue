<template>
  <div class="space-y-6 p-6 max-w-[1800px] mx-auto text-slate-200">
    <div
        v-if="data.analysisModeLabel || data.analysisDisclaimer"
        class="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4 shadow-lg"
    >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-3">
                <span class="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-emerald-200">
                    {{ data.analysisModeLabel || '分析模式' }}
                </span>
                <span class="text-sm text-slate-300">
                    偏正式结论
                </span>
            </div>
            <span class="text-xs text-slate-400">
                盘后建议可纳入正式计划
            </span>
        </div>
        <p v-if="data.analysisDisclaimer" class="mt-3 text-sm leading-relaxed text-slate-200">
            {{ data.analysisDisclaimer }}
        </p>
    </div>

    <div
        v-if="postmarketAsOfSummary"
        class="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-4 shadow-lg"
    >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p class="text-xs uppercase tracking-[0.28em] text-cyan-300/80">数据日期</p>
                <p class="mt-1 text-lg font-semibold text-cyan-50">
                    本次盘后复盘主要基于 <span class="font-mono">{{ postmarketAsOfSummary.primaryDate }}</span> 的数据
                </p>
            </div>
            <div class="text-sm text-cyan-100/90">
                {{ postmarketAsOfSummary.detailText }}
            </div>
        </div>
    </div>

    <!-- 1. Header Section: Modern Trading Terminal Style -->
    <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <!-- Stock Info -->
        <div class="flex items-center gap-6">
            <div>
                <div class="flex items-baseline gap-3">
                    <h1 class="text-3xl font-bold text-white tracking-tight">{{ data.stockName }}</h1>
                    <span class="text-sm font-medium text-slate-500 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">A股</span>
                </div>
                <div class="flex items-baseline gap-4 mt-1">
                    <span class="text-4xl font-mono font-medium text-white tracking-tighter">{{ data.currentPrice.toFixed(2) }}</span>
                    <div class="flex items-center gap-2" v-if="data.changePercent !== undefined">
                        <span :class="['text-lg font-bold font-mono', data.changePercent >= 0 ? 'text-rose-500' : 'text-emerald-500']">
                            {{ data.changePercent >= 0 ? '+' : '' }}{{ data.changePercent }}%
                        </span>
                        <!-- Trend Arrow -->
                        <TrendingUp v-if="data.changePercent >= 0" class="w-5 h-5 text-rose-500" />
                        <TrendingUp v-else class="w-5 h-5 text-emerald-500 transform rotate-180" />
                    </div>
                </div>
            </div>
            
            <!-- Market Stats Pills -->
            <div class="hidden md:flex gap-3 ml-4">
                <div v-if="data.turnoverRate !== undefined" class="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 flex flex-col items-center min-w-[80px]">
                    <span class="text-[10px] text-slate-500 uppercase tracking-wider">换手率</span>
                    <span class="text-sm font-mono font-medium text-slate-300">{{ data.turnoverRate }}%</span>
                </div>
                <div v-if="data.volumeRatio !== undefined" class="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 flex flex-col items-center min-w-[80px]">
                    <span class="text-[10px] text-slate-500 uppercase tracking-wider">量比</span>
                    <span class="text-sm font-mono font-medium text-slate-300">{{ data.volumeRatio }}</span>
                </div>
                <div v-if="data.marketSentiment" class="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 flex flex-col items-center min-w-[80px]">
                    <span class="text-[10px] text-slate-500 uppercase tracking-wider">环境</span>
                    <span class="text-sm font-medium text-indigo-400">{{ data.marketSentiment }}</span>
                </div>
            </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-4 w-full lg:w-auto">
             <div class="flex-1 lg:flex-none flex items-center justify-end gap-3 bg-slate-800/50 p-1.5 rounded-xl border border-slate-700/50 backdrop-blur-sm">
                <div class="px-3 py-1 relative group">
                    <span class="text-xs text-slate-500 block border-b border-dashed border-slate-600 inline-block cursor-help">AI 评分</span>
                    <span :class="['text-xl font-bold font-mono', scoreColorClass]">{{ data.diagnosis.score }}</span>
                     <!-- Tooltip -->
                     <div class="absolute top-full right-0 mt-2 w-56 p-2 bg-slate-900 border border-slate-700 rounded shadow-xl text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                        基于技术面、基本面、资金面综合计算的推荐指数(0-100)。>80分代表多维度共振强烈推荐。
                    </div>
                </div>
                 <button 
                    @click="showDetailModal = true"
                    class="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all shadow-lg shadow-indigo-900/20 font-medium text-sm group"
                >
                    <FileText class="w-4 h-4 group-hover:scale-110 transition-transform" />
                    查看深度研报
                </button>
             </div>
        </div>
    </div>

    <!-- 2. Main Dashboard Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        <!-- Left Column: The Verdict (AI Core Decision) -->
        <div class="xl:col-span-4 flex flex-col gap-6">
            <!-- 移除 overflow-hidden 以允许 tooltip 溢出显示 -->
            <div v-if="data.tradingStrategy" class="flex-1 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700 shadow-2xl relative group">
                <!-- Dynamic Glow Background - 限制在容器内部 -->
                <div class="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                     <div :class="['absolute top-0 right-0 w-64 h-64 bg-opacity-10 blur-[80px] rounded-full transform translate-x-1/3 -translate-y-1/3 transition-colors duration-500', adviceStyle.glowColor]"></div>
                </div>
                
                <div class="relative z-10 h-full flex flex-col">
                    <div class="flex justify-between items-center mb-6">
                        <div class="flex items-center gap-2">
                            <BrainCircuit class="w-5 h-5 text-slate-400" />
                            <span class="text-sm font-bold text-slate-400 uppercase tracking-wider">AI 决策引擎</span>
                        </div>
                        <span :class="['px-2.5 py-1 rounded text-xs font-bold border uppercase tracking-wide relative group cursor-help', adviceStyle.badge]">
                            置信度 {{ data.tradingStrategy.coreDecision.confidenceLevel }}
                            <!-- Tooltip -->
                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-slate-900 border border-slate-700 rounded shadow-xl text-xs text-slate-300 font-normal normal-case opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 text-left">
                                AI 对本次分析结论的把握程度(1-10)。高置信度(>8)意味着数据完整且各维度信号一致。
                            </div>
                        </span>
                    </div>

                    <div class="mb-8">
                        <h2 :class="['font-black tracking-tight mb-2', adviceStyle.textColor,data.tradingStrategy.coreDecision.action.length >10 ?'text-2xl': 'text-5xl' ] ">
                            {{ data.tradingStrategy.coreDecision.action }}
                        </h2>
                        <p class="text-slate-400 font-medium flex items-center gap-2">
                            <Activity class="w-4 h-4" />
                            建议操作: {{ data.tradingStrategy.coreDecision.urgency }}
                        </p>
                    </div>
                    <!-- TOOD  -->
                    <div class="flex-1 bg-slate-950/30 rounded-xl p-5 border border-slate-800/50 backdrop-blur-sm">
                        <p class="text-base text-slate-300 leading-relaxed whitespace-pre-wrap font-light">
                            {{ data.tradingStrategy.coreDecision.reasoning }}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right Column: The Action Plan (Grid of Widgets) -->
        <div v-if="data.tradingStrategy" class="xl:col-span-8 flex flex-col gap-6">
            <!-- Strategy Header -->
            <div class="flex items-center gap-2 pb-2 border-b border-slate-800">
                <Target class="w-5 h-5 text-slate-400" />
                <h3 class="text-lg font-bold text-slate-200">交易执行计划</h3>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                <!-- 1. Entry Zone -->
                <div class="bg-slate-800/40 rounded-xl p-5 border border-slate-700/50 hover:border-indigo-500/30 transition-colors group">
                    <div class="flex justify-between items-start mb-3">
                        <span class="text-sm font-medium text-slate-400">建议入场区间</span>
                        <div class="p-1.5 rounded bg-indigo-500/10 text-indigo-400 group-hover:text-indigo-300 transition-colors">
                            <GitFork class="w-4 h-4" />
                        </div>
                    </div>
                    <div :class="['font-mono font-bold text-white mb-2', data.tradingStrategy.entryPlan.optimalEntry.length > 15 ? 'text-base' : 'text-2xl']">{{ data.tradingStrategy.entryPlan.optimalEntry }}</div>
                    <div v-if="data.tradingStrategy.entryPlan.alternativeEntry && data.tradingStrategy.entryPlan.alternativeEntry !== 'N/A'" class="text-sm text-slate-500 border-t border-slate-700/50 pt-2 mt-2">
                        备选方案: <span class="text-slate-400">{{ data.tradingStrategy.entryPlan.alternativeEntry }}</span>
                    </div>
                </div>

                <!-- 2. Stop Loss -->
                <div class="bg-slate-800/40 rounded-xl p-5 border border-slate-700/50 hover:border-rose-500/30 transition-colors group">
                    <div class="flex justify-between items-start mb-3">
                        <span class="text-sm font-medium text-slate-400">严格止损位</span>
                        <div class="p-1.5 rounded bg-rose-500/10 text-rose-400 group-hover:text-rose-300 transition-colors">
                            <ShieldAlert class="w-4 h-4" />
                        </div>
                    </div>
                    <div :class="['font-mono font-bold text-rose-400 mb-2', data.tradingStrategy.riskManagement.stopLoss.price.length > 15 ? 'text-base' : 'text-2xl']">{{ data.tradingStrategy.riskManagement.stopLoss.price }}</div>
                    <div class="text-sm text-slate-500 border-t border-slate-700/50 pt-2 mt-2 flex items-center gap-2">
                         <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                         风控底线，触达即撤
                    </div>
                </div>

                <!-- 3. Profit Targets -->
                <div class="bg-slate-800/40 rounded-xl p-5 border border-slate-700/50 hover:border-emerald-500/30 transition-colors group md:col-span-2">
                    <div class="flex justify-between items-start mb-4">
                        <span class="text-sm font-medium text-slate-400">获利目标规划</span>
                        <div class="p-1.5 rounded bg-emerald-500/10 text-emerald-400 group-hover:text-emerald-300 transition-colors">
                            <Target class="w-4 h-4" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-8">
                        <div>
                            <span class="text-xs text-emerald-500/70 font-bold uppercase tracking-wider mb-1 block">目标一</span>
                            <div class="text-xl font-mono font-bold text-emerald-400">{{ data.tradingStrategy.profitTaking.target1.price }}</div>
                        </div>
                        <div v-if="data.tradingStrategy.profitTaking.target2.price && data.tradingStrategy.profitTaking.target2.price !== '0'" class="pl-8 border-l border-slate-700/50">
                            <span class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 block">目标二</span>
                            <div class="text-xl font-mono font-bold text-slate-300">{{ data.tradingStrategy.profitTaking.target2.price }}</div>
                        </div>
                    </div>
                </div>

                <!-- 4. Position Sizing -->
                <div class="bg-slate-800/40 rounded-xl p-5 border border-slate-700/50 hover:border-amber-500/30 transition-colors group md:col-span-2">
                    <div class="flex flex-col gap-4">
                        <!-- Top: Position Sizing -->
                        <div class="flex items-center gap-4">
                            <div class="flex-1">
                                <span class="text-sm font-medium text-slate-400 block mb-0.5">建议仓位管理</span>
                                <div class="text-lg font-bold text-white">{{ data.tradingStrategy.riskManagement.positionSizing.suggestedSize }}</div>
                            </div>
                        </div>
                        
                        <!-- Bottom: Risk Reward Ratio -->
                        <div class="pt-4 border-t border-slate-700/50" v-if="data.performanceMetrics?.riskRewardRatio && data.performanceMetrics.riskRewardRatio !== 'N/A'">
                            <div class="relative inline-block">
                                <span class="text-xs text-slate-500 mb-1 border-b border-dashed border-slate-600 inline-block cursor-help peer">盈亏比</span>
                                <!-- Tooltip -->
                                <div class="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-900 border border-slate-700 rounded shadow-xl text-xs text-slate-300 opacity-0 peer-hover:opacity-100 transition-opacity pointer-events-none z-20 text-left">
                                    潜在收益与风险的比值。
                                </div>
                            </div>
                            
                            <div class="text-sm font-mono font-bold text-amber-400 break-words leading-relaxed">
                                {{ data.performanceMetrics.riskRewardRatio }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div v-if="qualityCards.length > 0" class="bg-slate-900/60 rounded-2xl border border-slate-800 p-6">
        <div class="flex items-center justify-between gap-4 mb-5">
            <div class="flex items-center gap-2">
                <Info class="w-5 h-5 text-cyan-400" />
                <h3 class="text-lg font-bold text-slate-100">数据质量状态</h3>
            </div>
            <span class="text-xs text-slate-500">公开接口环境下的实时可信度提示</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div
                v-for="card in qualityCards"
                :key="card.key"
                class="rounded-xl border p-4 transition-colors"
                :class="card.panelClass"
            >
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <div class="text-sm font-semibold text-slate-100">{{ card.label }}</div>
                        <div class="text-xs text-slate-400 mt-1">{{ card.source }}</div>
                    </div>
                    <span class="px-2 py-1 rounded-full text-xs font-mono border" :class="card.badgeClass">
                        {{ card.scoreText }}
                    </span>
                </div>

                <div class="space-y-2 text-xs text-slate-400">
                    <div>日期 {{ formatAsOf(card.asOf) }}</div>
                    <div>链路 {{ card.tierText }}</div>
                    <div>{{ card.flagsText }}</div>
                    <div v-if="card.extraText" class="text-amber-300">{{ card.extraText }}</div>
                </div>

                <div v-if="card.issues.length > 0" class="mt-3 pt-3 border-t border-slate-700/60 space-y-1">
                    <div
                        v-for="issue in card.issues"
                        :key="issue"
                        class="text-xs text-slate-300 leading-relaxed break-words whitespace-normal"
                    >
                        {{ issue }}
                    </div>
                </div>
            </div>
        </div>
    </div>

    <DetailedReportModal 
        v-if="showDetailModal" 
        :data="data" 
        @close="showDetailModal = false" 
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { 
    BrainCircuit, TrendingUp, Activity, Target, 
    ShieldAlert, GitFork, FileText, Info
} from 'lucide-vue-next';
import DetailedReportModal from './DetailedReportModal.vue';
import type { StockAnalysis } from '../types';

const props = defineProps<{
  data: StockAnalysis;
}>();

const showDetailModal = ref(false);

const scoreColorClass = computed(() => {
    const s = props.data.diagnosis.score;
    if (s >= 80) return 'text-emerald-400';
    if (s >= 60) return 'text-indigo-400';
    if (s >= 40) return 'text-amber-400';
    return 'text-rose-400';
});

const adviceStyle = computed(() => {
    const action = props.data.tradingStrategy?.coreDecision.action || '';
    
    if (action.includes('买入')) {
        return {
            glowColor: 'bg-rose-600',
            textColor: 'text-rose-400',
            badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        };
    }
    if (action.includes('减持') || action.includes('卖出')) {
        return {
            glowColor: 'bg-emerald-600',
            textColor: 'text-emerald-400',
            badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        };
    }
    return {
        glowColor: 'bg-slate-600',
        textColor: 'text-slate-300',
        badge: 'bg-slate-500/10 text-slate-300 border-slate-500/20'
    };
});

const qualityCards = computed(() => {
    const quality = props.data.dataQuality;
    if (!quality) return [];

    const cards = [
        { key: 'snapshot', label: '实时快照', meta: quality.snapshot, extraText: '' },
        { key: 'history', label: '历史K线', meta: quality.history, extraText: '' },
        { key: 'financial', label: '财务数据', meta: quality.financial || undefined, extraText: '' },
        {
            key: 'fundflow',
            label: '资金流',
            meta: quality.fundFlow?.summary || undefined,
            extraText: quality.fundFlow && quality.fundFlow.missingDays > 0
                ? `${quality.fundFlow.missingDays} 个交易日存在字段缺失`
                : ''
        }
    ];

    return cards
        .filter((card) => card.meta)
        .map((card) => {
            const meta = card.meta!;
            const tone = meta.qualityLevel === 'high'
                ? {
                    panelClass: 'border-emerald-500/20 bg-emerald-500/5',
                    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }
                : meta.qualityLevel === 'medium'
                    ? {
                        panelClass: 'border-amber-500/20 bg-amber-500/5',
                        badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }
                    : {
                        panelClass: 'border-rose-500/20 bg-rose-500/5',
                        badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    };

            return {
                ...card,
                ...tone,
                source: meta.source,
                scoreText: `${meta.qualityLevel.toUpperCase()} ${meta.qualityScore}`,
                asOf: meta.asOf || '未知',
                tierText: meta.tier === 'primary' ? '主接口' : meta.tier === 'fallback' ? '回退接口' : '缓存',
                flagsText: [
                    meta.cacheHit ? '命中缓存' : '实时抓取',
                    meta.stale ? '已过期' : '未过期',
                    meta.isEstimated ? '含估算字段' : '无估算'
                ].join(' / '),
                issues: meta.issues.slice(0, 3),
            };
        });
});

const formatAsOf = (value?: string) => {
    if (!value) return '未知';
    const normalized = value.replace('T', ' ');
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : value;
};

const postmarketAsOfSummary = computed(() => {
    if (props.data.analysisMode !== 'postmarket') return null;

    const quality = props.data.dataQuality;
    if (!quality) return null;

    const historyDate = quality.history?.asOf;
    const fundFlowDate = quality.fundFlow?.summary?.asOf;
    const financialDate = quality.financial?.asOf;
    const snapshotDate = quality.snapshot?.asOf;
    const primaryDate = historyDate || fundFlowDate || financialDate || snapshotDate;

    if (!primaryDate) return null;

    const details = [
        historyDate ? `K线 ${historyDate}` : null,
        fundFlowDate ? `资金流 ${fundFlowDate}` : null,
        financialDate ? `财务 ${financialDate}` : null,
        snapshotDate ? `快照 ${snapshotDate}` : null,
    ].filter(Boolean);

    return {
        primaryDate,
        detailText: details.join(' | '),
    };
});
</script>
