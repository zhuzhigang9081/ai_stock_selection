#!/usr/bin/env python3
import json
import sys
from datetime import datetime

import pandas as pd
import tushare as ts

from tushare_client import create_tushare_pro_client


def sanitize(value):
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.strftime("%Y-%m-%d")
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def json_ok(data, as_of=None, issues=None, is_estimated=False):
    print(
        json.dumps(
            {
                "ok": True,
                "data": data,
                "asOf": as_of,
                "issues": issues or [],
                "isEstimated": is_estimated,
            },
            ensure_ascii=False,
        )
    )


def json_error(message):
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))


def normalize_symbol(symbol: str) -> str:
    normalized = str(symbol or "").strip().upper()
    if normalized.endswith(".SZ") or normalized.endswith(".SH"):
        return normalized
    if len(normalized) == 6 and normalized.isdigit():
        if normalized.startswith(("6", "9")):
            return f"{normalized}.SH"
        return f"{normalized}.SZ"
    raise RuntimeError(f"无法识别股票代码: {symbol}")


def get_latest_trade_date(pro):
    df = pro.trade_cal(exchange="", is_open="1", start_date="20240101", end_date=datetime.now().strftime("%Y%m%d"))
    if df is None or df.empty:
        raise RuntimeError("无法获取最近交易日")
    return str(df.iloc[0]["cal_date"])


def get_recent_trade_dates(pro, limit=5):
    df = pro.trade_cal(exchange="", is_open="1", start_date="20240101", end_date=datetime.now().strftime("%Y%m%d"))
    if df is None or df.empty:
        raise RuntimeError("无法获取交易日历")
    return [str(item) for item in df.head(limit)["cal_date"].tolist()]


def handle_search(payload, pro):
    query = str(payload.get("query") or payload.get("q") or "").strip().lower()
    if not query:
        json_ok([], issues=["empty query"], is_estimated=True)
        return

    df = pro.stock_basic(exchange="", list_status="L", fields="ts_code,symbol,name,cnspell,industry,market")
    if df is None or df.empty:
        raise RuntimeError("stock_basic 返回为空")

    records = []
    for _, row in df.iterrows():
        symbol = str(row.get("symbol") or "")
        ts_code = str(row.get("ts_code") or "")
        name = str(row.get("name") or "")
        cnspell = str(row.get("cnspell") or "").lower()
        haystacks = [symbol.lower(), ts_code.lower(), name.lower(), cnspell]
        if any(query in item for item in haystacks if item):
            records.append(
                {
                    "symbol": ts_code,
                    "name": name,
                    "industry": sanitize(row.get("industry")),
                    "market": sanitize(row.get("market")),
                }
            )
        if len(records) >= int(payload.get("limit", 20)):
            break

    json_ok(records, as_of=datetime.now().strftime("%Y-%m-%d"))


def handle_sector(payload, pro):
    symbol = normalize_symbol(payload["symbol"])
    df = pro.stock_basic(
        exchange="",
        list_status="L",
        ts_code=symbol,
        fields="ts_code,name,industry",
    )
    if df is None or df.empty:
        raise RuntimeError(f"未找到股票基础信息: {symbol}")

    industry = sanitize(df.iloc[0].get("industry")) or "未知行业"
    json_ok(industry, as_of=datetime.now().strftime("%Y-%m-%d"), is_estimated=industry == "未知行业")


def handle_history(payload, pro):
    symbol = normalize_symbol(payload["symbol"])
    limit = int(payload.get("limit", 250))
    adj = str(payload.get("adj") or "qfq")
    df = ts.pro_bar(api=pro, ts_code=symbol, adj=adj, limit=limit)
    if df is None or df.empty:
        raise RuntimeError(f"未获取到日线数据: {symbol}")

    df = df.sort_values("trade_date")
    records = []
    for _, row in df.iterrows():
        records.append(
            {
                "date": str(row["trade_date"]),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["vol"]),
                "amount": sanitize(row.get("amount")),
                "changePercent": sanitize(row.get("pct_chg")),
            }
        )

    json_ok(records, as_of=records[-1]["date"])


def handle_snapshot(payload, pro):
    symbol = normalize_symbol(payload["symbol"])
    trade_date = str(payload.get("trade_date") or get_latest_trade_date(pro))
    issues = []

    basic_df = pro.daily_basic(
        ts_code=symbol,
        trade_date=trade_date,
        fields="ts_code,trade_date,turnover_rate,volume_ratio",
    )
    if basic_df is None or basic_df.empty:
        issues.append(f"daily_basic 在 {trade_date} 无数据")
        basic_df = pro.daily_basic(
            ts_code=symbol,
            limit=1,
            fields="ts_code,trade_date,turnover_rate,volume_ratio",
        )

    quote_df = ts.pro_bar(api=pro, ts_code=symbol, adj="qfq", limit=2)
    if quote_df is None or quote_df.empty:
        raise RuntimeError(f"未获取到快照所需日线数据: {symbol}")

    quote_df = quote_df.sort_values("trade_date")
    latest = quote_df.iloc[-1].to_dict()
    previous = quote_df.iloc[-2].to_dict() if len(quote_df) > 1 else None

    stock_df = pro.stock_basic(exchange="", list_status="L", ts_code=symbol, fields="ts_code,name")
    stock_name = symbol
    if stock_df is not None and not stock_df.empty:
        stock_name = str(stock_df.iloc[0].get("name") or symbol)
    else:
        issues.append("stock_basic 未返回股票名称")

    close_price = float(latest["close"])
    prev_close = float(previous["close"]) if previous and previous.get("close") is not None else close_price
    change_percent = ((close_price - prev_close) / prev_close * 100) if prev_close else 0

    basic_row = basic_df.iloc[0].to_dict() if basic_df is not None and not basic_df.empty else {}
    volume_ratio = sanitize(basic_row.get("volume_ratio"))
    turnover_rate = sanitize(basic_row.get("turnover_rate"))
    if volume_ratio is None:
        issues.append("Tushare snapshot 未返回量比")
    if turnover_rate is None:
        issues.append("Tushare snapshot 未返回换手率")

    market_sentiment = "震荡"
    if change_percent > 1.5:
        market_sentiment = "多头"
    elif change_percent < -1.5:
        market_sentiment = "空头"

    json_ok(
        {
            "symbol": symbol,
            "name": stock_name,
            "price": close_price,
            "changePercent": round(change_percent, 2),
            "turnoverRate": turnover_rate,
            "volumeRatio": volume_ratio,
            "marketSentiment": market_sentiment,
        },
        as_of=sanitize(latest.get("trade_date")) or trade_date,
        issues=issues,
        is_estimated=False,
    )


def handle_financial(payload, pro):
    symbol = normalize_symbol(payload["symbol"])
    trade_date = str(payload.get("trade_date") or get_latest_trade_date(pro))
    issues = []

    daily_basic = pro.daily_basic(
        ts_code=symbol,
        trade_date=trade_date,
        fields="ts_code,trade_date,turnover_rate,volume_ratio,pe,pb,total_mv",
    )
    if daily_basic is None or daily_basic.empty:
        issues.append(f"daily_basic 在 {trade_date} 无数据")
        daily_basic = pro.daily_basic(
            ts_code=symbol,
            limit=1,
            fields="ts_code,trade_date,turnover_rate,volume_ratio,pe,pb,total_mv",
        )

    fina_indicator = pro.fina_indicator(
        ts_code=symbol,
        limit=1,
        fields="ts_code,end_date,ann_date,roe,grossprofit_margin,debt_to_assets,or_yoy,netprofit_yoy",
    )

    if (daily_basic is None or daily_basic.empty) and (fina_indicator is None or fina_indicator.empty):
        raise RuntimeError(f"未获取到财务数据: {symbol}")

    basic_row = daily_basic.iloc[0].to_dict() if daily_basic is not None and not daily_basic.empty else {}
    fina_row = fina_indicator.iloc[0].to_dict() if fina_indicator is not None and not fina_indicator.empty else {}

    result = {
        "pe": sanitize(basic_row.get("pe")) or 0,
        "pb": sanitize(basic_row.get("pb")) or 0,
        "roe": sanitize(fina_row.get("roe")) or 0,
        "grossMargin": sanitize(fina_row.get("grossprofit_margin")) or 0,
        "netMargin": 0,
        "debtRatio": sanitize(fina_row.get("debt_to_assets")) or 0,
        "revenueYoY": sanitize(fina_row.get("or_yoy")) or 0,
        "profitYoY": sanitize(fina_row.get("netprofit_yoy")) or 0,
        "marketCap": sanitize(basic_row.get("total_mv")) or 0,
        "turnoverRate": sanitize(basic_row.get("turnover_rate")),
        "volumeRatio": sanitize(basic_row.get("volume_ratio")),
    }

    if not fina_row:
        issues.append("fina_indicator 未返回最新指标")

    as_of = sanitize(fina_row.get("ann_date")) or sanitize(basic_row.get("trade_date")) or trade_date
    json_ok(result, as_of=as_of, issues=issues, is_estimated=not fina_row)


def handle_fundflow(payload, pro):
    symbol = normalize_symbol(payload["symbol"])
    limit = int(payload.get("limit", 30))
    df = pro.moneyflow(
        ts_code=symbol,
        limit=limit,
        fields=(
            "ts_code,trade_date,buy_sm_amount,sell_sm_amount,buy_md_amount,sell_md_amount,"
            "buy_lg_amount,sell_lg_amount,buy_elg_amount,sell_elg_amount,net_mf_amount"
        ),
    )
    if df is None or df.empty:
        raise RuntimeError(f"未获取到资金流数据: {symbol}")

    df = df.sort_values("trade_date")
    trade_dates = [str(item) for item in df["trade_date"].tolist()]
    price_df = pro.daily(
        ts_code=symbol,
        start_date=trade_dates[0],
        end_date=trade_dates[-1],
        fields="ts_code,trade_date,close,pct_chg",
    )
    price_map = {}
    if price_df is not None and not price_df.empty:
        for _, row in price_df.iterrows():
            price_map[str(row["trade_date"])] = {
                "close": sanitize(row.get("close")),
                "changePercent": sanitize(row.get("pct_chg")),
            }

    records = []
    for _, row in df.iterrows():
        medium_net = float((row.get("buy_md_amount") or 0) - (row.get("sell_md_amount") or 0))
        small_net = float((row.get("buy_sm_amount") or 0) - (row.get("sell_sm_amount") or 0))
        large_net = float((row.get("buy_lg_amount") or 0) - (row.get("sell_lg_amount") or 0))
        super_large_net = float((row.get("buy_elg_amount") or 0) - (row.get("sell_elg_amount") or 0))
        main_net = large_net + super_large_net
        trade_date = str(row["trade_date"])
        price_info = price_map.get(trade_date, {})

        records.append(
            {
                "date": trade_date,
                "mainNetInflow": main_net,
                "mainNetInflowRate": None,
                "superLargeInflow": super_large_net,
                "largeInflow": large_net,
                "mediumInflow": medium_net,
                "smallInflow": small_net,
                "close": price_info.get("close"),
                "changePercent": price_info.get("changePercent"),
                "netMfAmount": sanitize(row.get("net_mf_amount")),
            }
        )

    json_ok(records, as_of=records[-1]["date"])


def handle_industry_rank(payload, pro):
    trade_date = str(payload.get("trade_date") or get_latest_trade_date(pro))
    limit = int(payload.get("limit", 20))
    issues = []

    trade_dates = [trade_date]
    if "trade_date" not in payload:
        trade_dates = get_recent_trade_dates(pro, limit=5)

    df = None
    resolved_trade_date = trade_date
    for candidate in trade_dates:
        current = pro.sw_daily(trade_date=candidate, fields="trade_date,ts_code,name,pct_change")
        if current is not None and not current.empty:
            df = current
            resolved_trade_date = candidate
            if candidate != trade_date:
                issues.append(f"申万行业排行未更新到 {trade_date}，已回退到最近可用交易日 {candidate}")
            break

    if df is None or df.empty:
        raise RuntimeError(f"未获取到申万行业日线: {trade_date}")

    df = df.sort_values("pct_change", ascending=False).head(limit)
    records = []
    for _, row in df.iterrows():
        records.append(
            {
                "code": str(row["ts_code"]),
                "name": str(row["name"]),
                "changePercent": float(row["pct_change"]),
            }
        )

    json_ok(records, as_of=resolved_trade_date, issues=issues, is_estimated=resolved_trade_date != trade_date)


def main():
    if len(sys.argv) < 3:
        json_error("usage: tushare_bridge.py <command> <payload_json>")
        sys.exit(1)

    command = sys.argv[1]
    payload = json.loads(sys.argv[2])
    pro = create_tushare_pro_client()

    try:
        if command == "search":
            handle_search(payload, pro)
        elif command == "snapshot":
            handle_snapshot(payload, pro)
        elif command == "sector":
            handle_sector(payload, pro)
        elif command == "history":
            handle_history(payload, pro)
        elif command == "financial":
            handle_financial(payload, pro)
        elif command == "fundflow":
            handle_fundflow(payload, pro)
        elif command == "industry_rank":
            handle_industry_rank(payload, pro)
        else:
            raise RuntimeError(f"unknown command: {command}")
    except Exception as exc:
        json_error(str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
