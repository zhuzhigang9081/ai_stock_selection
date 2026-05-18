#!/usr/bin/env python3
import os
from pathlib import Path

import tushare as ts


DEFAULT_PROXY_URL = "http://118.89.66.41:8010/"


def load_env_file():
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def create_tushare_pro_client(token: str | None = None, proxy_url: str | None = None):
    """Create a Tushare Pro client using the project's shared proxy settings."""
    load_env_file()
    resolved_token = token or os.getenv("TUSHARE_TOKEN", "").strip()
    resolved_proxy_url = proxy_url or os.getenv("TUSHARE_PROXY_URL", DEFAULT_PROXY_URL).strip()

    if not resolved_token:
        raise RuntimeError("Missing TUSHARE_TOKEN. Please configure it in .env or pass token explicitly.")

    pro = ts.pro_api(resolved_token)
    pro._DataApi__http_url = resolved_proxy_url
    return pro


if __name__ == "__main__":
    client = create_tushare_pro_client()
    print(client.index_basic(limit=5))
    print(ts.pro_bar(api=client, ts_code="000001.SZ", limit=3))
