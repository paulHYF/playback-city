"""POLYV 直播开放接口签名，规则见帮助中心 live/api/buildSign：
appSecret + 非空参数按 key 升序拼接 k1v1k2v2… + appSecret，MD5 取 32 位大写。"""
import hashlib
import time


def sign(params: dict, secret: str) -> str:
    raw = "".join(f"{k}{v}" for k, v in sorted(params.items()) if k != "sign" and v not in (None, ""))
    return hashlib.md5(f"{secret}{raw}{secret}".encode()).hexdigest().upper()


def signed(params: dict, app_id: str, secret: str, clock_offset_ms: int = 0) -> dict:
    full = {k: v for k, v in params.items() if v is not None}
    full["appId"] = app_id
    full["timestamp"] = str(int(time.time() * 1000) + clock_offset_ms)
    full["sign"] = sign(full, secret)
    return full
