<script setup lang="ts">
import Dashboard from './views/Dashboard.vue';
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-cyan-400/80">A股智能分析</p>
          <h1 class="text-lg font-semibold text-white">A股 AI 分析台</h1>
        </div>
      </div>
    </header>

    <Dashboard />
  </div>
</template>
