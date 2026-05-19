import dotenv from 'dotenv';
import { generateDailyAdviceBatch } from '../services/adviceService';

dotenv.config();

function parseSymbols(): string[] {
  const envValue = process.env.DAILY_ADVICE_SYMBOLS || '';
  return envValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const symbols = parseSymbols();

  if (symbols.length === 0) {
    throw new Error('请先在环境变量 DAILY_ADVICE_SYMBOLS 中配置股票列表，例如 000630.SZ,600519.SH');
  }

  console.log(`[Daily Advice Job] 开始生成每日建议，共 ${symbols.length} 只股票`);
  const items = await generateDailyAdviceBatch(symbols);
  const successCount = items.filter((item) => 'action' in item).length;
  const errorCount = items.filter((item) => 'error' in item).length;

  console.log(`[Daily Advice Job] 完成，成功 ${successCount} 条，失败 ${errorCount} 条`);
  console.log(JSON.stringify(items, null, 2));
}

main().catch((error) => {
  console.error('[Daily Advice Job] 执行失败:', error);
  process.exit(1);
});
