<template>
  <div class="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm">
    <h3 class="text-slate-400 text-sm font-medium mb-6 uppercase tracking-wider flex items-center gap-2">
      <Crosshair class="w-4 h-4" />
      关键位交易计划
    </h3>

    <div class="relative pl-4 ml-2 border-l-2 border-slate-700/50 space-y-8">
      <!-- Target (止盈) -->
      <div class="relative group">
        <div class="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)] ring-4 ring-slate-900 transition-all group-hover:scale-125"></div>
        <div class="flex justify-between items-baseline">
          <div>
            <span class="block text-xs text-rose-400/80 font-medium mb-0.5">TARGET / 止盈</span>
            <span class="text-xl font-bold text-rose-500">{{ formatPrice(levels.target) }}</span>
          </div>
          <span class="text-xs text-slate-500 font-mono">收益: {{ calculateRatio(levels.target) }}%</span>
        </div>
      </div>

      <!-- Entry (首仓) -->
      <div class="relative group">
        <div class="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-slate-300 ring-4 ring-slate-900 transition-all group-hover:scale-125"></div>
        <div class="flex justify-between items-baseline">
          <div>
            <span class="block text-xs text-slate-400/80 font-medium mb-0.5">ENTRY / 首仓</span>
            <span class="text-xl font-bold text-slate-200">{{ formatPrice(levels.entry) }}</span>
          </div>
          <span class="text-xs text-slate-500 font-mono">成本</span>
        </div>
      </div>

      <!-- Add (补仓) -->
      <div class="relative group">
        <div class="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] ring-4 ring-slate-900 animate-pulse"></div>
        <div class="flex justify-between items-baseline">
          <div>
            <span class="block text-xs text-blue-400/80 font-medium mb-0.5">ADD / 关键补仓</span>
            <span class="text-xl font-bold text-blue-500">{{ formatPrice(levels.add) }}</span>
          </div>
          <span class="text-xs text-slate-500 font-mono">回撤: -{{ calculateDrop(levels.add) }}%</span>
        </div>
      </div>

      <!-- Stop Loss (止损) -->
      <div class="relative group">
        <div class="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] ring-4 ring-slate-900 transition-all group-hover:scale-125"></div>
        <div class="flex justify-between items-baseline">
          <div>
            <span class="block text-xs text-emerald-400/80 font-medium mb-0.5">STOP / 止损</span>
            <span class="text-xl font-bold text-emerald-500">{{ formatPrice(levels.stopLoss) }}</span>
          </div>
          <span class="text-xs text-slate-500 font-mono">风险: {{ calculateRatio(levels.stopLoss) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Crosshair } from 'lucide-vue-next';

const props = defineProps<{
  levels: {
    entry: number;
    add: number;
    target: number;
    stopLoss: number;
  };
  currentPrice: number;
}>();

const formatPrice = (price: number) => price.toFixed(2);

const calculateRatio = (targetPrice: number) => {
  const ratio = ((targetPrice - props.levels.entry) / props.levels.entry) * 100;
  return ratio > 0 ? `+${ratio.toFixed(2)}` : ratio.toFixed(2);
};

const calculateDrop = (price: number) => {
    const drop = ((props.levels.entry - price) / props.levels.entry) * 100;
    return drop.toFixed(2);
}
</script>
