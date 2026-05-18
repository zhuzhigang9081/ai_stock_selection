# Tushare Bridge 说明

## 1. 初始化方式

项目统一使用 [`tushare_client.py`](/Users/zhuzhigang/Documents/ai/ai_stock_selection/scripts/tushare_client.py:1) 初始化 Tushare Pro 客户端。

它会从项目根目录 `.env` 读取：

- `TUSHARE_TOKEN`
- `TUSHARE_PROXY_URL`

当前代理模式等价于：

```python
import tushare as ts

pro = ts.pro_api("your_token")
pro._DataApi__http_url = "http://118.89.66.41:8010/"
```

## 2. Bridge 文件

统一桥接脚本：

- [`tushare_bridge.py`](/Users/zhuzhigang/Documents/ai/ai_stock_selection/scripts/tushare_bridge.py:1)

调用格式：

```bash
python scripts/tushare_bridge.py <command> '<payload_json>'
```

示例：

```bash
python scripts/tushare_bridge.py search '{"query":"铜陵"}'
python scripts/tushare_bridge.py history '{"symbol":"000630.SZ","limit":5}'
python scripts/tushare_bridge.py financial '{"symbol":"000630.SZ"}'
```

## 3. 当前已实现命令

- `search`
  - 股票搜索，基于 `stock_basic`
- `sector`
  - 行业归属，基于 `stock_basic.industry`
- `history`
  - 日线历史，基于 `ts.pro_bar`
- `financial`
  - 财务与估值，基于 `daily_basic + fina_indicator`
- `fundflow`
  - 资金流向，基于 `moneyflow`
- `industry_rank`
  - 行业排行，基于 `sw_daily`

## 4. 方案 A 的定位

当前采用的是“Node 外壳 + Python 数据桥接”路线：

- Node 继续提供 API 和前端接口
- Python 负责 Tushare / AKShare 等数据源适配

后续如果要正式切换数据源，优先在 Node 中增加对 `tushare_bridge.py` 的调用，而不是一次性重写整个后端。
