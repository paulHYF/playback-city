import email.utils
import time

import httpx

from app.config import Settings

from .sign import signed


class PolyvError(RuntimeError):
    pass


TIMESTAMP_EXPIRED = 10003


class PolyvClient:
    """POLYV 直播开放接口客户端，只负责签名与响应解包，接口清单见 api.py。

    本机时钟与服务器偏差过大时接口报「时间戳过期」：按响应 Date 头校准一次再重签重试。
    """

    clock_offset_ms = 0  # 类级缓存，校准一次后续客户端都沿用

    def __init__(self, settings: Settings):
        if not settings.polyv_app_id or not settings.polyv_app_secret:
            raise PolyvError("未配置 POLYV_APP_ID / POLYV_APP_SECRET")
        self.settings = settings
        self.http = httpx.AsyncClient(base_url=settings.polyv_api_base, timeout=20)

    async def get(self, path: str, **params):
        return await self._call(lambda: self.http.get(path, params=self._sign(params)))

    async def post(self, path: str, **params):
        return await self._call(lambda: self.http.post(path, data=self._sign(params)))

    async def post_json(self, path: str, body: dict | list, **params):
        """v4 写接口：签名只算 URL 参数，业务参数放 JSON body。"""
        return await self._call(lambda: self.http.post(path, params=self._sign(params), json=body))

    async def upload(self, path: str, files: dict, **params):
        """multipart 上传：签名参数随表单提交。"""
        return await self._call(lambda: self.http.post(path, data=self._sign(params), files=files))

    async def _call(self, send):
        resp = await send()
        if self._timestamp_expired(resp) and self._calibrate(resp):
            resp = await send()
        return self._unwrap(resp)

    async def download_text(self, url: str) -> str:
        """下载字幕等外链文件（不签名）。"""
        resp = await self.http.get(url)
        resp.raise_for_status()
        return resp.text

    async def close(self) -> None:
        await self.http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.close()

    def _sign(self, params: dict) -> dict:
        return signed(params, self.settings.polyv_app_id, self.settings.polyv_app_secret, PolyvClient.clock_offset_ms)

    @staticmethod
    def _timestamp_expired(resp: httpx.Response) -> bool:
        try:
            return resp.json().get("code") == TIMESTAMP_EXPIRED
        except ValueError:
            return False

    @staticmethod
    def _calibrate(resp: httpx.Response) -> bool:
        date = resp.headers.get("date")
        if not date:
            return False
        PolyvClient.clock_offset_ms = int((email.utils.parsedate_to_datetime(date).timestamp() - time.time()) * 1000)
        return True

    @staticmethod
    def _unwrap(resp: httpx.Response):
        if resp.is_error:
            raise PolyvError(f"{resp.request.url.path}: HTTP {resp.status_code} {resp.text[:300]}")
        body = resp.json()
        if body.get("code") != 200:
            raise PolyvError(f"{resp.request.url.path}: {body.get('code')} {body.get('message') or body.get('error')}")
        return body.get("data")
