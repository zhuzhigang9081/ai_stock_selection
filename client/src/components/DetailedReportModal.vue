<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" @click="$emit('close')"></div>

    <!-- Modal Panel -->
    <div class="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
      
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-slate-700/50 bg-slate-800 shrink-0 z-10">
        <div class="flex items-center gap-3">
            <div class="p-2 bg-indigo-500/10 rounded-lg">
                <FileText class="w-6 h-6 text-indigo-400" />
            </div>
            <div>
                <h2 class="text-xl font-bold text-white tracking-tight">AI 深度研报</h2>
                <p class="text-sm text-slate-400 flex items-center gap-2">
                    {{ data.stockName }} 
                    <span class="w-1 h-1 rounded-full bg-slate-600"></span>
                    {{ new Date().toLocaleDateString() }}
                    <span v-if="data.analysisModeLabel" class="w-1 h-1 rounded-full bg-slate-600"></span>
                    <span v-if="data.analysisModeLabel">{{ data.analysisModeLabel }}</span>
                </p>
            </div>
        </div>
        <button 
            @click="$emit('close')"
            class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
            <X class="w-6 h-6" />
        </button>
      </div>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar bg-slate-900/30">
        <article class="prose prose-invert prose-slate max-w-none">
            <section v-if="data.analysisDisclaimer" class="mb-10">
                <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-50">
                    <p class="m-0 text-sm leading-relaxed">{{ data.analysisDisclaimer }}</p>
                </div>
            </section>
            
            <!-- 1. Executive Summary -->
            <section class="mb-10">
                <h3 class="flex items-center gap-2 text-2xl font-bold text-indigo-100 mb-4 pb-2 border-b border-indigo-500/30">
                    <Zap class="w-6 h-6 text-indigo-400" />
                    核心摘要
                </h3>
                <div class="bg-indigo-900/10 border border-indigo-500/20 rounded-xl p-6 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10">
                        <Quote class="w-20 h-20 text-indigo-400" />
                    </div>
                    <p class="text-lg font-medium text-indigo-100 mb-4 leading-relaxed">
                        {{ data.executiveSummary?.oneLineDecision }}
                    </p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        <div>
                            <span class="block text-indigo-400 mb-1 font-bold">核心逻辑</span>
                            <span class="text-slate-300">{{ data.executiveSummary?.coreLogic }}</span>
                        </div>
                        <div>
                            <span class="block text-emerald-400 mb-1 font-bold">预期收益</span>
                            <span class="text-slate-300 font-mono">{{ data.executiveSummary?.expectedReturn }}</span>
                        </div>
                    </div>
                </div>
            </section>

            <section v-if="qualitySections.length > 0" class="mb-10">
                <h3 class="flex items-center gap-2 text-2xl font-bold text-slate-100 mb-6 pb-2 border-b border-slate-700/50">
                    <Info class="w-6 h-6 text-cyan-400" />
                    数据质量与接口状态
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                        v-for="section in qualitySections"
                        :key="section.key"
                        class="rounded-xl border p-5"
                        :class="section.panelClass"
                    >
                        <div class="flex items-center justify-between gap-3 mb-3">
                            <h4 class="m-0 text-base font-bold text-slate-100">{{ section.label }}</h4>
                            <span class="text-xs font-mono px-2 py-1 rounded border" :class="section.badgeClass">
                                {{ section.scoreText }}
                            </span>
                        </div>
                        <div class="space-y-2 text-sm text-slate-300">
                            <p class="m-0">来源: {{ section.source }}</p>
                            <p class="m-0">日期: {{ formatAsOf(section.asOf) }}</p>
                            <p class="m-0">链路: {{ section.tierText }}</p>
                            <p class="m-0">状态: {{ section.flagsText }}</p>
                            <p v-if="section.extraText" class="m-0 text-amber-300">{{ section.extraText }}</p>
                        </div>
                        <div v-if="section.issues.length > 0" class="mt-4 pt-4 border-t border-slate-700/60 space-y-2">
                            <p
                                v-for="issue in section.issues"
                                :key="issue"
                                class="m-0 text-sm text-slate-300 leading-relaxed"
                            >
                                {{ issue }}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section v-if="data.continuity?.previousReport || data.continuity?.continuityNote" class="mb-10">
                <h3 class="flex items-center gap-2 text-2xl font-bold text-slate-100 mb-6 pb-2 border-b border-slate-700/50">
                    <GitFork class="w-6 h-6 text-amber-400" />
                    连续分析上下文
                </h3>

                <div class="rounded-xl border border-amber-500/20 bg-amber-900/10 p-5 space-y-4">
                    <p v-if="data.continuity?.continuityNote" class="m-0 text-sm text-amber-100 leading-relaxed">
                        {{ data.continuity.continuityNote }}
                    </p>

                    <div v-if="data.continuity?.previousReport" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div class="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4">
                            <div class="text-xs text-slate-500 mb-2">上一份报告</div>
                            <div class="space-y-2 text-slate-300">
                                <p class="m-0">时间: {{ formatTimestamp(data.continuity.previousReport.timestamp) }}</p>
                                <p class="m-0">建议: {{ data.continuity.previousReport.advice }}</p>
                                <p class="m-0">评分: {{ data.continuity.previousReport.score }}</p>
                                <p class="m-0">结论: {{ data.continuity.previousReport.oneLineDecision || 'N/A' }}</p>
                            </div>
                        </div>

                        <div class="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4">
                            <div class="text-xs text-slate-500 mb-2">上一份关键价位</div>
                            <div class="space-y-2 text-slate-300">
                                <p class="m-0">当时价格: {{ data.continuity.previousReport.currentPrice ?? 'N/A' }}</p>
                                <p class="m-0">目标价: {{ data.continuity.previousReport.targetPrice ?? 'N/A' }}</p>
                                <p class="m-0">止损位: {{ data.continuity.previousReport.stopLoss ?? 'N/A' }}</p>
                                <p class="m-0">理由: {{ data.continuity.previousReport.reasoning || 'N/A' }}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

             <!-- 2. Trading Strategy Details (Moved Up) -->
             <section class="mb-10">
                <h3 class="flex items-center gap-2 text-2xl font-bold text-slate-100 mb-6 pb-2 border-b border-slate-700/50">
                    <Target class="w-6 h-6 text-blue-400" />
                    交易执行细节
                </h3>
                
                <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                    <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700">
                        <div class="p-6">
                            <h4 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">入场计划</h4>
                            <ul class="space-y-4">
                                <li>
                                    <span class="block text-xs text-slate-500 mb-1">最佳买点</span>
                                    <span :class="['font-mono text-emerald-400 font-bold', (data.tradingStrategy?.entryPlan.optimalEntry?.length || 0) > 10 ? 'text-base' : 'text-xl']">{{ data.tradingStrategy?.entryPlan.optimalEntry }}</span>
                                </li>
                                <li>
                                    <span class="block text-xs text-slate-500 mb-1">备选区间</span>
                                    <span class="text-slate-300">{{ data.tradingStrategy?.entryPlan.alternativeEntry }}</span>
                                </li>
                                <li>
                                    <span class="block text-xs text-slate-500 mb-1">入场逻辑</span>
                                    <span class="text-sm text-slate-300">{{ data.tradingStrategy?.entryPlan.entryRationale }}</span>
                                </li>
                            </ul>
                        </div>
                        <div class="p-6">
                            <h4 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">风控退出</h4>
                            <ul class="space-y-4">
                                <li>
                                    <span class="block text-xs text-slate-500 mb-1">止损价格</span>
                                    <span :class="['font-mono text-rose-400 font-bold', (data.tradingStrategy?.riskManagement.stopLoss.price?.length || 0) > 10 ? 'text-base' : 'text-xl']">{{ data.tradingStrategy?.riskManagement.stopLoss.price }}</span>
                                </li>
                                <li>
                                    <span class="block text-xs text-slate-500 mb-1">风险控制</span>
                                    <span class="text-sm text-slate-300">
                                        单笔风险 {{ data.tradingStrategy?.riskManagement.stopLoss.riskPercentage }}
                                        <span class="mx-1">|</span> 
                                        建议仓位 {{ data.tradingStrategy?.riskManagement.positionSizing.suggestedSize }}
                                    </span>
                                </li>
                                <li>
                                    <span class="block text-xs text-slate-500 mb-1">止盈目标</span>
                                    <div class="flex gap-4">
                                        <span class="text-emerald-400 font-mono">T1: {{ data.tradingStrategy?.profitTaking.target1.price }}</span>
                                        <span class="text-slate-400 font-mono">T2: {{ data.tradingStrategy?.profitTaking.target2.price }}</span>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 3. Detailed Diagnosis -->
            <section class="mb-10">
                <h3 class="flex items-center gap-2 text-2xl font-bold text-slate-100 mb-6 pb-2 border-b border-slate-700/50">
                    <Activity class="w-6 h-6 text-amber-400" />
                    多维因子深度解析
                </h3>
                
                <div class="space-y-6">
                    <div v-for="(section, key) in detailedSections" :key="key" class="bg-slate-800 p-5 rounded-xl border border-slate-700/50">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="text-lg font-bold text-slate-200 flex items-center gap-2 m-0">
                                <component :is="section.icon" :class="['w-5 h-5', section.color]" />
                                {{ section.title }}
                            </h4>
                            <span v-if="section.data && section.data.score > 0" class="px-2 py-1 rounded bg-slate-700/50 text-xs font-mono text-slate-400">
                                评分: {{ section.data.score }}
                            </span>
                        </div>
                        <!-- Added whitespace-pre-wrap for plain text display -->
                        <p class="text-slate-300 leading-relaxed text-justify mb-3 whitespace-pre-wrap">
                            {{ section.data?.detailedReason }}
                        </p>
                        <div v-if="section.data?.riskAssessment && !section.data.riskAssessment.includes('分析报告')" class="flex items-start gap-2 text-sm bg-rose-900/10 p-3 rounded border border-rose-900/20">
                            <AlertTriangle class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <span class="text-rose-300/90 italic">{{ section.data.riskAssessment }}</span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="mb-10">
                <h3 class="flex items-center gap-2 text-2xl font-bold text-slate-100 mb-6 pb-2 border-b border-slate-700/50">
                    <MessageSquare class="w-6 h-6 text-cyan-400" />
                    报告问答
                </h3>

                <div class="rounded-xl border border-slate-700 bg-slate-800/70 p-5">
                    <div class="space-y-4">
                        <div class="max-h-80 overflow-y-auto space-y-3 pr-1">
                            <div
                                v-for="message in qaMessages"
                                :key="message.id"
                                class="rounded-xl px-4 py-3"
                                :class="message.role === 'user' ? 'bg-cyan-600/20 border border-cyan-500/20 text-cyan-50' : 'bg-slate-900/50 border border-slate-700 text-slate-200'"
                            >
                                <div class="text-xs uppercase tracking-[0.2em] mb-2" :class="message.role === 'user' ? 'text-cyan-300' : 'text-slate-500'">
                                    {{ message.role === 'user' ? '你的问题' : '报告助手' }}
                                </div>
                                <p class="m-0 whitespace-pre-wrap leading-relaxed text-sm">{{ message.content }}</p>
                            </div>

                            <div v-if="qaLoading" class="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                                正在结合当前报告和上次分析生成回答...
                            </div>
                        </div>

                        <div class="grid gap-3">
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="prompt in qaQuickPrompts"
                                    :key="prompt"
                                    @click="questionInput = prompt"
                                    class="rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/30 hover:text-cyan-200 transition-colors"
                                >
                                    {{ prompt }}
                                </button>
                            </div>

                            <textarea
                                v-model="questionInput"
                                rows="3"
                                placeholder="比如：这次买点为什么和上次不一样？止损应该怎么执行？"
                                class="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500/40"
                            ></textarea>

                            <div v-if="qaError" class="text-sm text-rose-300">{{ qaError }}</div>

                            <div class="flex justify-end">
                                <button
                                    @click="askQuestion"
                                    :disabled="qaLoading || !questionInput.trim()"
                                    class="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
                                >
                                    提问
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 4. Scenario Analysis -->
            <section class="mb-10">
                <h3 class="flex items-center gap-2 text-2xl font-bold text-slate-100 mb-6 pb-2 border-b border-slate-700/50">
                    <GitFork class="w-6 h-6 text-cyan-400" />
                    情景推演与概率
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <!-- Bull -->
                    <div class="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-5">
                        <div class="flex justify-between items-center mb-4">
                            <span class="text-emerald-400 font-bold">乐观情景</span>
                            <span class="text-xs font-mono bg-emerald-900/30 text-emerald-300 px-2 py-1 rounded">{{ data.scenarioAnalysis?.bullCase.probability }} 概率</span>
                        </div>
                        <div class="text-2xl font-mono font-bold text-white mb-2">{{ data.scenarioAnalysis?.bullCase.priceTarget }}</div>
                        <p class="text-sm text-slate-400 leading-snug mb-3 min-h-[40px]">
                            {{ data.scenarioAnalysis?.bullCase.triggerConditions }}
                        </p>
                    </div>

                    <!-- Base -->
                    <div class="bg-slate-700/20 border border-slate-600/30 rounded-xl p-5">
                        <div class="flex justify-between items-center mb-4">
                            <span class="text-slate-300 font-bold">中性情景</span>
                            <span class="text-xs font-mono bg-slate-700/50 text-slate-300 px-2 py-1 rounded">{{ data.scenarioAnalysis?.baseCase.probability }} 概率</span>
                        </div>
                        <div class="text-2xl font-mono font-bold text-white mb-2">{{ data.scenarioAnalysis?.baseCase.priceTarget }}</div>
                        <p class="text-sm text-slate-400 leading-snug mb-3 min-h-[40px]">
                            {{ data.scenarioAnalysis?.baseCase.triggerConditions }}
                        </p>
                    </div>

                    <!-- Bear -->
                    <div class="bg-rose-900/10 border border-rose-500/20 rounded-xl p-5">
                        <div class="flex justify-between items-center mb-4">
                            <span class="text-rose-400 font-bold">悲观情景</span>
                            <span class="text-xs font-mono bg-rose-900/30 text-rose-300 px-2 py-1 rounded">{{ data.scenarioAnalysis?.bearCase.probability }} 概率</span>
                        </div>
                        <div class="text-2xl font-mono font-bold text-white mb-2">{{ data.scenarioAnalysis?.bearCase.worstCasePrice }}</div>
                         <p class="text-sm text-slate-400 leading-snug mb-3 min-h-[40px]">
                            {{ data.scenarioAnalysis?.bearCase.riskFactors }}
                        </p>
                    </div>
                </div>
            </section>

             <!-- 5. Monitoring Plan & Metrics -->
             <section class="mb-10">
                <h3 class="flex items-center gap-2 text-2xl font-bold text-slate-100 mb-6 pb-2 border-b border-slate-700/50">
                    <ShieldAlert class="w-6 h-6 text-rose-400" />
                    监控与绩效评估
                </h3>
                
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Monitoring Plan -->
                    <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
                        <h4 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex justify-between">
                            动态监控计划
                        </h4>
                        
                        <div class="space-y-4">
                            <!-- Key Levels -->
                            <div>
                                <span class="text-xs font-bold text-slate-500 block mb-2">关键位监控</span>
                                <div class="space-y-2">
                                    <div v-for="(level, i) in data.monitoringPlan?.keyLevelsToWatch" :key="i" class="flex items-center justify-between bg-slate-700/30 p-2 rounded border border-slate-600/30">
                                        <div class="flex flex-col ">
                                            <span class="text-sm font-mono font-bold">{{ level.level }}</span>
                                            <span class="text-xs text-slate-400">{{ level.significance }}</span>
                                            <span class="text-xs text-rose-300 bg-rose-900/20  py-0.5 rounded">{{ level.actionIfBreak }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Exit Triggers -->
                            <div>
                                <span class="text-xs font-bold text-slate-500 block mb-2">退出条件</span>
                                <div class="space-y-2">
                                    <div v-for="(trigger, i) in data.monitoringPlan?.exitTriggers" :key="i" class="flex items-start gap-2 text-sm text-slate-300">
                                        <div class="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></div>
                                        <div>
                                            <span class="text-slate-200">{{ trigger.condition }}</span>
                                            <span class="text-slate-500 mx-1">→</span>
                                            <span class="text-rose-400">{{ trigger.action }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Performance Metrics -->
                    <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
                        <h4 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">策略绩效预估</h4>
                        
                        <div class="space-y-3">
                            <!-- Win Rate -->
                            <div class="flex items-center justify-between p-3 bg-slate-700/20 rounded border border-slate-600/30 relative group">
                                <span class="text-sm text-slate-400 cursor-help border-b border-dashed border-slate-600 inline-block shrink-0 mr-4">预估胜率</span>
                                <span class="text-xs font-mono font-bold text-slate-200 text-right">{{ (parseFloat(data.performanceMetrics?.estimatedWinRate || '0') * 100).toFixed(0) }}%</span>
                                <!-- Tooltip -->
                                <div class="absolute bottom-full right-0 mb-2 w-48 p-2 bg-slate-900 border border-slate-700 rounded shadow-xl text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 text-left">
                                    AI 对本次判断的信心程度，非绝对上涨概率。>80% 为高置信度。
                                </div>
                            </div>

                            <!-- Risk/Reward -->
                            <div class="flex items-center justify-between p-3 bg-slate-700/20 rounded border border-slate-600/30 relative group">
                                <span class="text-sm text-slate-400 cursor-help border-b border-dashed border-slate-600 inline-block shrink-0 mr-4">盈亏比</span>
                                
                                <span class="text-xs font-mono font-bold text-slate-200 text-right">
                                    {{ data.performanceMetrics?.riskRewardRatio }}
                                </span>

                                <!-- Tooltip -->
                                <div class="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 border border-slate-700 rounded shadow-xl text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 text-left">
                                    潜在收益与风险的比值。例如 1:2.5 代表承担 1 元风险博取 2.5 元收益。
                                </div>
                            </div>

                            <!-- Sharpe -->
                            <div class="flex items-center justify-between p-3 bg-slate-700/20 rounded border border-slate-600/30 relative group">
                                <span class="text-sm text-slate-400 cursor-help border-b border-dashed border-slate-600 inline-block shrink-0 mr-4">夏普比率</span>
                                
                                <span class="text-xs font-mono font-bold text-slate-200 text-right">
                                    {{ data.performanceMetrics?.sharpeRatio }}
                                </span>

                                <!-- Tooltip -->
                                <div class="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 border border-slate-700 rounded shadow-xl text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 text-left">
                                    衡量收益的性价比。数值越高(>1)，代表在承受同等波动风险下获得的超额收益越高。
                                </div>
                            </div>

                            <!-- Max Drawdown -->
                            <div class="flex items-center justify-between p-3 bg-slate-700/20 rounded border border-slate-600/30 relative group">
                                <span class="text-sm text-slate-400 cursor-help border-b border-dashed border-slate-600 inline-block shrink-0 mr-4">最大回撤</span>
                                
                                <span class="text-xs font-mono font-bold text-slate-200 text-right">
                                    {{ data.performanceMetrics?.maximumDrawdown }}
                                </span>

                                <!-- Tooltip -->
                                <div class="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 border border-slate-700 rounded shadow-xl text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 text-left">
                                    策略可能出现的最大浮亏幅度。数值越小越安全。
                                </div>
                            </div>

                            <!-- Holding Period -->
                            <div class="flex items-center justify-between p-3 bg-slate-700/20 rounded border border-slate-600/30">
                                <span class="text-sm text-slate-400 shrink-0 mr-4">建议持有周期</span>
                                <span class="text-xs font-mono font-bold text-slate-200 text-right">{{ data.performanceMetrics?.holdingPeriod }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            
            <!-- Removed Educational Insights Section -->

        </article>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-slate-700/50 bg-slate-800 flex justify-end shrink-0 z-10">
        <button 
            @click="$emit('close')"
            class="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
        >
            关闭
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import axios from 'axios';
import { 
    X, FileText, Zap, Quote, Activity, Globe, 
    AlertTriangle, GitFork, Target, PieChart, Coins, Info, MessageSquare
} from 'lucide-vue-next';
import type { StockAnalysis } from '../types';

const props = defineProps<{
  data: StockAnalysis;
}>();

defineEmits(['close']);

interface QaMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

const questionInput = ref('');
const qaLoading = ref(false);
const qaError = ref<string | null>(null);
const qaMessages = ref<QaMessage[]>([]);
const qaQuickPrompts = [
    '这次买点为什么和上次不一样？',
    '这次止损位应该怎么执行？',
    '当前最大的风险是什么？',
    '如果没买到第一买点，后面怎么办？'
];

const detailedSections = computed(() => {
    // Dynamically filter out sections that might not exist or we want to hide if empty
    const sections = [
        {
            key: 'tech',
            title: '技术面深度分析',
            icon: Activity,
            color: 'text-indigo-400',
            data: props.data.detailedAnalysis?.technicalAnalysis
        },
        {
            key: 'fundamental',
            title: '基本面深度分析',
            icon: PieChart,
            color: 'text-cyan-400',
            data: props.data.detailedAnalysis?.fundamentalAnalysis
        },
        {
            key: 'fundFlow',
            title: '资金面深度分析',
            icon: Coins,
            color: 'text-rose-400',
            data: props.data.detailedAnalysis?.fundFlowAnalysis
        },
        {
            key: 'market',
            title: '综合研判与市场情绪',
            icon: Globe,
            color: 'text-purple-400',
            data: props.data.detailedAnalysis?.marketAnalysis
        }
    ];
    
    // Filter out sections with no data
    return sections.filter(s => s.data);
});

const qualitySections = computed(() => {
    const quality = props.data.dataQuality;
    if (!quality) return [];

    const sections = [
        { key: 'snapshot', label: '实时快照', meta: quality.snapshot, extraText: '' },
        { key: 'history', label: '历史K线', meta: quality.history, extraText: '' },
        { key: 'financial', label: '财务数据', meta: quality.financial || undefined, extraText: '' },
        {
            key: 'fundflow',
            label: '资金流',
            meta: quality.fundFlow?.summary || undefined,
            extraText: quality.fundFlow && quality.fundFlow.missingDays > 0
                ? `${quality.fundFlow.missingDays} 个交易日存在缺失字段`
                : ''
        }
    ];

    return sections
        .filter((section) => section.meta)
        .map((section) => {
            const meta = section.meta!;
            const tone = meta.qualityLevel === 'high'
                ? {
                    panelClass: 'border-emerald-500/20 bg-emerald-900/10',
                    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }
                : meta.qualityLevel === 'medium'
                    ? {
                        panelClass: 'border-amber-500/20 bg-amber-900/10',
                        badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }
                    : {
                        panelClass: 'border-rose-500/20 bg-rose-900/10',
                        badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    };

            return {
                ...section,
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
                issues: meta.issues.slice(0, 4),
            };
        });
});

const askQuestion = async () => {
    const question = questionInput.value.trim();
    if (!question) return;

    qaError.value = null;
    qaMessages.value.push({
        id: `q_${Date.now()}`,
        role: 'user',
        content: question,
    });

    questionInput.value = '';
    qaLoading.value = true;

    try {
        const response = await axios.post('/api/report/qa', {
            question,
            symbol: props.data.symbol || props.data.continuity?.previousReport?.symbol,
            reportData: props.data,
            mode: props.data.analysisMode,
        });

        qaMessages.value.push({
            id: `a_${Date.now()}`,
            role: 'assistant',
            content: response.data.answer,
        });
    } catch (error: any) {
        qaError.value = error.response?.data?.error || '报告问答失败，请稍后再试';
    } finally {
        qaLoading.value = false;
    }
};

const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
};

const formatAsOf = (value?: string) => {
    if (!value) return '未知';
    const normalized = value.replace('T', ' ');
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : value;
};
</script>

<style scoped>
.prose h3 {
    margin-top: 0;
}
</style>
