import fs from 'fs';
import path from 'path';

const HISTORY_FILE = path.join(process.cwd(), 'data', 'history.json');

export interface HistoryRecord {
  id: string;
  timestamp: number;
  stockName: string;
  symbol: string;
  score: number;
  advice: string;
  fullData: any; // 存储完整的 StockAnalysis 对象
}

// 确保文件存在
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
}

export const getHistory = (): HistoryRecord[] => {
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取历史文件出错:', error);
    return [];
  }
};

export const addHistory = (record: Omit<HistoryRecord, 'id' | 'timestamp'>) => {
  try {
    const history = getHistory();
    const newRecord: HistoryRecord = {
      ...record,
      id: Date.now().toString(),
      timestamp: Date.now(),
    };
    
    // 前置新记录（最新的在最前）
    history.unshift(newRecord);
    
    // 限制为 50 条记录，以保持文件大小可控
    if (history.length > 50) {
        history.length = 50;
    }

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    return newRecord;
  } catch (error) {
    console.error('写入历史文件出错:', error);
  }
};
