<template>
  <div class="h-screen bg-slate-800/80 backdrop-blur-md border-r border-slate-700/50 flex flex-col w-72 transition-transform duration-300 ease-in-out z-20">
    <!-- Header -->
    <div class="p-6 border-b border-slate-700/50 flex items-center justify-between">
      <h2 class="text-lg font-bold text-slate-100 tracking-wide flex items-center gap-2">
        <History class="w-5 h-5 text-indigo-400" />
        查询历史
      </h2>
      <button @click="$emit('refresh')" class="text-slate-400 hover:text-white transition-colors">
        <RefreshCw class="w-4 h-4" />
      </button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
      <div v-if="loading" class="text-center py-10 text-slate-500 text-sm">
        加载中...
      </div>
      
      <div v-else-if="history.length === 0" class="text-center py-10 text-slate-500 text-sm">
        暂无查询记录
      </div>

      <div 
        v-for="item in history" 
        :key="item.id"
        @click="$emit('select', { fullData: item.fullData, symbol: item.symbol })"
        class="group bg-slate-700/30 hover:bg-slate-700/60 border border-slate-600/30 hover:border-indigo-500/30 rounded-lg p-3 cursor-pointer transition-all duration-200"
      >
        <div class="flex justify-between items-start mb-1">
            <span class="font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">{{ item.stockName }}</span>
            <span class="text-xs font-mono text-slate-500">{{ formatTime(item.timestamp) }}</span>
        </div>
        
        <div class="flex justify-between items-center">
            <span class="text-xs text-slate-400 font-mono">{{ item.symbol }}</span>
            <div class="flex items-center gap-2">
                 <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                    盘后
                 </span>
                 <span :class="['text-xs font-bold px-1.5 py-0.5 rounded', getScoreColor(item.score)]">
                    {{ item.score }}
                 </span>
            </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { History, RefreshCw } from 'lucide-vue-next';
import axios from 'axios';
import type { StockAnalysis } from '../types';

interface HistoryRecord {
  id: string;
  timestamp: number;
  mode?: 'postmarket';
  stockName: string;
  symbol: string;
  score: number;
  advice: string;
  fullData: StockAnalysis;
}

defineProps<{
  refreshKey?: number;
}>();

const emit = defineEmits(['select', 'refresh']);

const history = ref<HistoryRecord[]>([]);
const loading = ref(false);

const fetchHistory = async () => {
  loading.value = true;
  try {
    const res = await axios.get('/api/history');
    history.value = res.data;
  } catch (err) {
    console.error('Failed to load history', err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchHistory();
});

const formatTime = (ts: number) => {
    const date = new Date(ts);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-rose-900/50 text-rose-300 border border-rose-700/50';
    if (score >= 60) return 'bg-amber-900/50 text-amber-300 border border-amber-700/50';
    return 'bg-slate-600/50 text-slate-300 border border-slate-500/50';
};

// Expose refresh method if needed, or watch props
defineExpose({ fetchHistory });
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(30, 41, 59, 0.5); /* slate-800/50 */
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #64748b; /* slate-500 */
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8; /* slate-400 */
}
</style>
