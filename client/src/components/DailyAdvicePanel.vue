<template>
  <section class="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-white">每日建议</h2>
        <p class="text-sm text-slate-400">查看最近生成的买卖建议记录</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          @click="fetchAdvice"
          :disabled="loading"
          class="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          刷新
        </button>
        <button
          @click="generateCurrent"
          :disabled="!currentSymbol || generating"
          class="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ generating ? '生成中...' : '生成当前股票建议' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {{ error }}
    </div>

    <div v-if="loading" class="rounded-md border border-slate-700 bg-slate-900/40 px-4 py-6 text-center text-slate-500">
      加载中...
    </div>

    <div v-else-if="items.length === 0" class="rounded-md border border-slate-700 bg-slate-900/40 px-4 py-6 text-center text-slate-500">
      暂无每日建议记录
    </div>

    <div v-else class="space-y-4">
      <article
        v-for="item in items"
        :key="item.id"
        class="rounded-lg border border-slate-700 bg-slate-900/40 p-4"
      >
        <div class="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-base font-semibold text-white">{{ item.stockName }}</h3>
              <span class="font-mono text-xs text-slate-500">{{ item.symbol }}</span>
              <span :class="['inline-flex rounded-full px-2 py-1 text-xs font-medium', actionClass(item.action)]">
                {{ actionLabel(item.action) }}
              </span>
            </div>
            <p class="leading-6 text-slate-300">{{ item.summary }}</p>
          </div>

          <div class="min-w-[280px] space-y-3">
            <button
              @click="emit('select-symbol', item.symbol)"
              class="w-full rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/40 hover:bg-slate-800"
            >
              查看这只股票分析
            </button>

            <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <div class="text-slate-500">日期</div>
                <div class="text-slate-200">{{ item.date }}</div>
              </div>
              <div>
                <div class="text-slate-500">变化</div>
                <div class="text-slate-200">{{ continuityStatus(item) }}</div>
              </div>
              <div>
                <div class="text-slate-500">置信度</div>
                <div class="font-mono text-slate-200">{{ item.confidence.toFixed(1) }}/10</div>
              </div>
              <div>
                <div class="text-slate-500">评分</div>
                <div class="font-mono text-slate-200">{{ item.score.toFixed(0) }}</div>
              </div>
              <div>
                <div class="text-slate-500">持有周期</div>
                <div class="text-slate-200">{{ item.holdingPeriod || '-' }}</div>
              </div>
              <div>
                <div class="text-slate-500">原始建议</div>
                <div class="text-slate-200">{{ item.sourceReport.advice || '-' }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-3">
          <div class="rounded-md border border-slate-800 bg-slate-950/30 p-3">
            <div class="mb-2 text-sm font-medium text-slate-300">关键价位</div>
            <div class="space-y-2 text-sm">
              <div class="flex items-start justify-between gap-4">
                <span class="text-slate-500">买点</span>
                <span class="font-mono text-slate-200">{{ item.entryRange || '-' }}</span>
              </div>
              <div class="flex items-start justify-between gap-4">
                <span class="text-slate-500">止损</span>
                <span class="font-mono text-slate-200">{{ item.stopLoss || '-' }}</span>
              </div>
              <div class="flex items-start justify-between gap-4">
                <span class="text-slate-500">目标</span>
                <span class="font-mono text-slate-200">{{ item.targetPrice || '-' }}</span>
              </div>
            </div>
          </div>

          <div class="rounded-md border border-slate-800 bg-slate-950/30 p-3">
            <div class="mb-2 text-sm font-medium text-slate-300">核心理由</div>
            <ul v-if="item.reasons.length > 0" class="space-y-2 text-sm text-slate-300">
              <li v-for="reason in item.reasons" :key="reason" class="leading-6">
                {{ reason }}
              </li>
            </ul>
            <div v-else class="text-sm text-slate-500">暂无理由摘要</div>
          </div>

          <div class="rounded-md border border-slate-800 bg-slate-950/30 p-3">
            <div class="mb-2 text-sm font-medium text-slate-300">风险提示</div>
            <ul v-if="item.riskFlags.length > 0" class="space-y-2 text-sm text-slate-300">
              <li v-for="risk in item.riskFlags" :key="risk" class="leading-6">
                {{ risk }}
              </li>
            </ul>
            <div v-else class="text-sm text-slate-500">暂无额外风险提示</div>
          </div>
        </div>

        <div
          v-if="item.continuity?.changeSummary || item.sourceReport.oneLineDecision || item.sourceReport.reasoning"
          class="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <div class="rounded-md border border-slate-800 bg-slate-950/30 p-3">
            <div class="mb-2 text-sm font-medium text-slate-300">建议变化说明</div>
            <p class="text-sm leading-6 text-slate-300">
              {{ item.continuity?.changeSummary || '暂无变化说明' }}
            </p>
          </div>

          <div class="rounded-md border border-slate-800 bg-slate-950/30 p-3">
            <div class="mb-2 text-sm font-medium text-slate-300">来源报告补充</div>
            <div class="space-y-2 text-sm text-slate-300">
              <p v-if="item.sourceReport.oneLineDecision" class="leading-6">
                <span class="text-slate-500">一句话结论：</span>{{ item.sourceReport.oneLineDecision }}
              </p>
              <p v-if="item.sourceReport.reasoning" class="leading-6">
                <span class="text-slate-500">原始理由：</span>{{ item.sourceReport.reasoning }}
              </p>
              <p v-if="!item.sourceReport.oneLineDecision && !item.sourceReport.reasoning" class="text-slate-500">
                暂无更多来源报告内容
              </p>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import axios from 'axios';
import type { DailyAdviceAction, DailyAdviceRecord } from '../types';

const props = defineProps<{
  currentSymbol?: string;
  analysts?: string[];
}>();

const emit = defineEmits<{
  (e: 'select-symbol', symbol: string): void;
}>();

const items = ref<DailyAdviceRecord[]>([]);
const loading = ref(false);
const generating = ref(false);
const error = ref<string | null>(null);

const actionLabel = (action: DailyAdviceAction) => {
  switch (action) {
    case 'buy':
      return '买入';
    case 'sell':
      return '卖出';
    case 'hold':
      return '持有';
    case 'watch':
    default:
      return '观察';
  }
};

const actionClass = (action: DailyAdviceAction) => {
  switch (action) {
    case 'buy':
      return 'bg-emerald-500/15 text-emerald-300';
    case 'sell':
      return 'bg-rose-500/15 text-rose-300';
    case 'hold':
      return 'bg-amber-500/15 text-amber-300';
    case 'watch':
    default:
      return 'bg-slate-600/40 text-slate-300';
  }
};

const continuityStatus = (item: DailyAdviceRecord) => {
  if (!item.continuity) return '-';
  if (!item.continuity.previousAction) return '首次生成';
  return item.continuity.changed ? '已变化' : '无变化';
};

const fetchAdvice = async () => {
  loading.value = true;
  error.value = null;

  try {
    const response = await axios.get<{ items: DailyAdviceRecord[] }>('/api/daily-advice?limit=20');
    items.value = response.data.items || [];
  } catch (err: any) {
    error.value = err.response?.data?.error || '加载每日建议失败';
  } finally {
    loading.value = false;
  }
};

const generateCurrent = async () => {
  if (!props.currentSymbol) return;

  generating.value = true;
  error.value = null;

  try {
    await axios.post('/api/daily-advice/generate', {
      symbol: props.currentSymbol,
      analysts: props.analysts || [],
    });
    await fetchAdvice();
  } catch (err: any) {
    error.value = err.response?.data?.error || '生成每日建议失败';
  } finally {
    generating.value = false;
  }
};

onMounted(() => {
  fetchAdvice();
});

defineExpose({ fetchAdvice });
</script>
