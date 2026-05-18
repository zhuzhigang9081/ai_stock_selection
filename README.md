# AI 智能选股助手 (AI Stock Selection)

本项目是一个基于人工智能（DeepSeek 大模型）的 A 股投资决策辅助系统。它通过集成多维度数据源（行情、历史 K 线、财务基本面、资金流向、行业信息），利用多智能体架构（Multi-Agent）进行全方位分析，最终生成专业的投资诊断报告和交易策略。

当前项目已进入“数据源迁移”阶段：

- 后端主体仍然是 `Node.js + TypeScript`
- 数据抓取层正在逐步切换到 `Python bridge + Tushare Pro`
- 旧的腾讯 / 东方财富 / AKShare 逻辑仍保留为回退链路

## 核心功能

### 1. 多维度数据采集
- **行情与历史 K 线**：优先通过 Tushare Pro 获取股票搜索、日线历史、估值辅助字段，并保留旧接口回退能力。
- **技术指标**：自动计算 MA 均线系统、MACD、RSI、KDJ、布林带、ATR、黄金分割支撑位等 20+ 种技术指标。
- **基本面数据**：抓取个股的市盈率 (PE)、市净率 (PB)、ROE、毛利率、营收/净利增长率等核心财务指标。
- **资金流向**：深度挖掘主力资金（超大单/大单）与散户资金（中单/小单）的博弈关系，支持 20 日资金流趋势分析。
- **行业信息**：支持个股行业归属和行业热度排行，用于判断板块背景。

### 2. AI 多智能体分析引擎
系统采用 **DeepSeek-V3** 大模型，构建了四个协同工作的 AI 智能体：
- **技术分析师 (Technical Agent)**：专注 K 线形态、趋势判断、支撑压力位及技术指标背离分析。
- **基本面分析师 (Fundamental Agent)**：评估公司质地、估值水平、盈利能力及成长性，识别财务风险。
- **资金面分析师 (Fund Flow Agent)**：洞察主力资金吸筹/出货行为，分析量价配合关系。
- **首席策略师 (Chief Strategist)**：综合上述三方报告，模拟投委会讨论，权衡多方观点，输出最终决策。

### 3. 智能决策输出
- **投资评级**：明确给出“买入”、“持有”或“卖出”评级及信心分数 (0-100)。
- **交易计划**：
  - **最佳入场区间**：基于技术支撑位的精确买点。
  - **严格止损位**：动态计算的风控底线。
  - **获利目标价**：基于阻力位和上涨空间的止盈目标。
  - **仓位建议**：结合风险评估的资金管理方案。
- **情景推演**：提供乐观、中性、悲观三种市场情景下的预案。
- **绩效预估**：计算预估胜率、盈亏比、夏普比率及最大回撤。

### 4. 现代化可视化前端
- **分析仪表盘**：采用 Vue 3 + Tailwind CSS 构建的金融终端界面。
- **动态图表**：直观展示价格走势、关键点位及风险收益比。
- **交互式报告**：支持查看详细的 AI 分析逻辑的深度研报。

## 技术栈

- **后端**：Node.js, Express, TypeScript
- **Python 数据桥接**：Tushare Pro, AKShare, pandas
- **AI 模型**：DeepSeek API (兼容 OpenAI SDK)
- **数据源**：Tushare Pro 优先，腾讯 / 东方财富 / AKShare 作为回退或补充
- **文档**：Swagger (OpenAPI 3.0)
- **前端**：Vue 3, Vite, Tailwind CSS, Lucide Icons

## 快速开始

### 1. 环境准备
确保已安装：

- Node.js (v16+)
- npm/yarn
- Python 3

### 2. 安装依赖
```bash
npm install
cd client && npm install && cd ..
```

如果需要启用 Tushare bridge，建议在 Python 环境中安装：

```bash
pip install tushare pandas
```

### 3. 配置环境变量
在根目录创建 `.env` 文件：
```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-chat
DEEPSEEK_REASONING_MODEL=deepseek-reasoner

# 如果想切换到智谱，可改成 AI_PROVIDER=zhipu
ZHIPU_API_KEY=your_zhipu_api_key_here
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
ZHIPU_CHAT_MODEL=glm-4.5
ZHIPU_REASONING_MODEL=glm-4.5

# 通用覆盖项（可选）
# AI_CHAT_MODEL=
# AI_REASONING_MODEL=
PORT=3000

# Tushare Pro 代理转发
TUSHARE_TOKEN=your_tushare_token
TUSHARE_PROXY_URL=http://118.89.66.41:8010/
```

### 4. 启动服务
```bash
# 启动服务 (http://localhost:3000)
npm run dev
```

### 5. 当前数据源说明

当前项目已改成“Node 外壳 + Python bridge”模式：

- `searchStocks`
  - 优先走 `scripts/tushare_bridge.py search`
  - 失败时回退腾讯 Smartbox

- `fetchStockHistory`
  - 优先走 `scripts/tushare_bridge.py history`
  - 失败时回退腾讯日线接口

- `fetchStockSector`
  - 优先走 `scripts/tushare_bridge.py sector`
  - 失败时回退东方财富

- `fetchIndustryRank`
  - 优先走 `scripts/tushare_bridge.py industry_rank`
  - 如果申万行业数据未更新到当日，会自动回退到最近可用交易日
  - 再失败时回退东方财富

- `fetchFinancialData`
  - 优先走 `scripts/tushare_bridge.py financial`
  - 失败时回退东方财富

- `fetchFundFlowData`
  - 优先走 `scripts/tushare_bridge.py fundflow`
  - 失败时回退旧链路

### 6. 查看文档

启动后端后，访问 `http://localhost:3000/api-docs` 查看完整的 API 文档。

## 目录结构
```
├── src/
│   ├── services/       # 核心业务逻辑 (AI 引擎, 数据获取, 历史记录)
│   ├── routes/         # API 路由定义
│   ├── index.ts        # 服务入口
│   └── config.ts       # 配置管理
├── client/             # 前端 Vue 项目
├── scripts/            # Python bridge (Tushare / AKShare)
├── data/               # 本地数据存储 (历史记录, 财务报表 CSV)
└── dist/               # 编译后的代码
```
