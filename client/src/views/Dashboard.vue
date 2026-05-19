<template>
  <div class="min-h-screen bg-slate-900 text-slate-100 flex overflow-hidden">
    <!-- Sidebar -->
    <HistorySidebar 
        ref="historySidebarRef"
        @select="handleHistorySelect" 
        @refresh="refreshHistory"
    />

    <!-- Main Content -->
    <div class="flex-1 overflow-y-auto h-screen p-4 sm:p-8">
        <div class="max-w-7xl mx-auto space-y-8">
      
            <!-- Search Header -->
            <div class="flex flex-col items-center space-y-6 pt-10 pb-6">
                <div class="space-y-2 text-center">
                    <h1 class="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                    股票诊断
                    </h1>
                    <p class="text-sm text-slate-400 sm:text-base">
                        输入股票代码开始分析
                    </p>
                </div>
                
                <div class="relative w-full max-w-lg group">
                <div class="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                <div class="relative flex items-center bg-slate-800 rounded-lg shadow-xl">
                    <Search class="absolute left-4 text-slate-400 w-5 h-5" />
                    <input 
                    v-model="searchQuery" 
                    @input="handleInput"
                    type="text" 
                    placeholder="输入股票代码 (e.g. 000933)" 
                    class="w-full bg-transparent border-none py-4 pl-12 pr-4 text-lg focus:ring-0 placeholder-slate-500 text-white rounded-lg"
                    />
                    <button 
                    @click="handleSearch"
                    :disabled="loading"
                    class="absolute right-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                    <span v-if="loading" class="flex items-center gap-2">
                        <Loader2 class="w-4 h-4 animate-spin" />
                        分析中
                    </span>
                    <span v-else>分析</span>
                    </button>
                </div>
                
                <!-- Autocomplete Dropdown -->
                <div v-if="suggestions.length > 0" class="absolute top-full left-0 w-full mt-2 bg-slate-800 rounded-lg shadow-2xl border border-slate-700 overflow-hidden z-50">
                    <div 
                        v-for="item in suggestions" 
                        :key="item.symbol"
                        @click="selectSuggestion(item)"
                        class="px-4 py-3 hover:bg-slate-700 cursor-pointer flex justify-between items-center transition-colors border-b border-slate-700/50 last:border-none"
                    >
                        <div class="flex items-center gap-3">
                            <span class="font-bold text-slate-200">{{ item.name }}</span>
                            <span class="text-xs font-mono text-slate-400 bg-slate-900/50 px-1.5 py-0.5 rounded">{{ item.symbol }}</span>
                        </div>
                        <span class="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">选择</span>
                    </div>
                </div>
                </div>

                <!-- Analysts Selection -->
                <div class="flex justify-center gap-6 pt-2">
                    <label v-for="option in analystsOptions" :key="option.id" class="flex items-center space-x-2 cursor-pointer group">
                        <div class="relative flex items-center">
                            <input 
                                type="checkbox" 
                                :value="option.id" 
                                v-model="selectedAnalysts" 
                                class="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-600 bg-slate-800 transition-all checked:border-indigo-500 checked:bg-indigo-500 hover:border-indigo-400"
                            >
                            <div class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                                </svg>
                            </div>
                        </div>
                        <span class="text-sm text-slate-400 group-hover:text-indigo-300 transition-colors">{{ option.label }}</span>
                    </label>
                </div>

            </div>

            <DailyAdvicePanel
              ref="dailyAdvicePanelRef"
              :current-symbol="searchQuery.trim() || result?.symbol"
              :analysts="selectedAnalysts"
              @select-symbol="handleAdviceSelect"
            />

            <!-- Content Area -->
            <div class="transition-all duration-500 ease-in-out">
                
                <!-- Error Message -->
                <div v-if="error" class="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-xl text-center max-w-2xl mx-auto">
                {{ error }}
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="flex flex-col items-center justify-center py-32 space-y-8 animate-in fade-in duration-500">
                    <div class="relative">
                        <!-- Outer Glow -->
                        <div class="absolute -inset-4 bg-indigo-500/20 rounded-full blur-xl animate-pulse"></div>
                        <!-- Spinner -->
                        <Loader2 class="w-24 h-24 text-indigo-500 animate-spin" />
                        <!-- Center Icon -->
                        <div class="absolute inset-0 flex items-center justify-center">
                            <BrainCircuit class="w-8 h-8 text-cyan-400" />
                        </div>
                    </div>
                    
                    <div class="text-center space-y-4">
                        <h3 class="text-3xl font-bold text-white tracking-tight">AI 正在进行深度全维分析</h3>
                        <p class="text-slate-400 max-w-lg mx-auto text-lg">
                            正在实时聚合全网数据，进行技术面、基本面与资金面交叉验证...
                        </p>
                        
                        <div class="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm mt-6 shadow-xl">
                            <Clock class="w-5 h-5 text-amber-400 animate-pulse" />
                            <span class="text-base font-medium text-slate-200">
                                预计耗时 <span class="text-amber-400 font-bold">3-5 分钟</span>，请耐心等待
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Results Dashboard -->
                <AnalysisDashboard 
                v-if="!loading && result" 
                :data="result" 
                />
                
                <!-- Empty State -->
                <div v-if="!loading && !result && !error" class="text-center text-slate-500 py-20">
                    <BarChart class="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>请输入股票代码开始 AI 诊断</p>
                </div>

            </div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { Search, BarChart, BrainCircuit, Clock, Loader2 } from 'lucide-vue-next';
import AnalysisDashboard from '../components/AnalysisDashboard.vue';
import DailyAdvicePanel from '../components/DailyAdvicePanel.vue';
import HistorySidebar from '../components/HistorySidebar.vue';
import type { StockAnalysis } from '../types';

const searchQuery = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<StockAnalysis | null>(null);
const historySidebarRef = ref<InstanceType<typeof HistorySidebar> | null>(null);
const dailyAdvicePanelRef = ref<InstanceType<typeof DailyAdvicePanel> | null>(null);

const selectedAnalysts = ref(['technical', 'fundamental', 'capital']);

const analystsOptions = [
    { id: 'technical', label: '技术面分析' },
    { id: 'fundamental', label: '基本面分析' },
    { id: 'capital', label: '资金面分析' }
];

// Autocomplete logic
const suggestions = ref<Array<{ symbol: string; name: string }>>([]);
let searchTimeout: any = null;

const handleInput = () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (!searchQuery.value || searchQuery.value.length < 2) {
        suggestions.value = [];
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            // Using the existing backend endpoint
            const res = await axios.get(`/api/stock/search?q=${searchQuery.value}`);
            console.log(res,'res');
            suggestions.value = res.data;
        } catch (e) {
            console.error(e);
        }
    }, 300);
};

const selectSuggestion = (item: { symbol: string; name: string }) => {
    searchQuery.value = item.symbol;
    suggestions.value = []; // Hide dropdown
    handleSearch(); // Trigger analysis
};

const handleSearch = async () => {
  const query = searchQuery.value.trim();
  if (!query) return;

  loading.value = true;
  error.value = null;
  result.value = null;

  try {
    // Assuming backend endpoint is /api/stock/diagnosis/:code
    const params = new URLSearchParams();
    if (selectedAnalysts.value.length > 0) {
        params.append('analysts', selectedAnalysts.value.join(','));
    }
    const response = await axios.get<StockAnalysis>(`/api/stock/diagnosis/${query}?${params.toString()}`);
    result.value = response.data;
    
    // Refresh history after successful search
    if (historySidebarRef.value) {
        historySidebarRef.value.fetchHistory();
    }
    if (dailyAdvicePanelRef.value) {
        dailyAdvicePanelRef.value.fetchAdvice();
    }
  } catch (err: any) {
    console.error(err);
    error.value = err.response?.data?.error || 'Failed to fetch analysis data. Please check the code and try again.';
  } finally {
    loading.value = false;
  }
};

const handleHistorySelect = (payload: { fullData: StockAnalysis, symbol: string }) => {
    // Directly use the saved data
    result.value = payload.fullData;
    
    // Update search box with the symbol from history record
    searchQuery.value = payload.symbol;
    
    loading.value = false;
    error.value = null;
};

const handleAdviceSelect = async (symbol: string) => {
    searchQuery.value = symbol;
    suggestions.value = [];
    await handleSearch();
};

const refreshHistory = () => {
    if (historySidebarRef.value) {
        historySidebarRef.value.fetchHistory();
    }
};
</script>
