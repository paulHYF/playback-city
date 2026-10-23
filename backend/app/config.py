import re
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    polyv_api_base: str = "https://develop-3-api.polyv.net"
    polyv_app_id: str = ""
    polyv_app_secret: str = ""

    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = ""

    data_dir: Path = Path("./data")
    cors_origins: str = "http://localhost:5173"

    @property
    def player_domain_info(self) -> dict[str, str]:
        """直播播放器 domainInfo：测试环境（develop-N-api）下所有域名换成 develop-N- 前缀，线上用播放器默认域名。"""
        m = re.match(r"https?://(develop-\d+)-api\.polyv\.net", self.polyv_api_base)
        if not m:
            return {}
        env = m.group(1)
        return {
            "live": f"{env}-live.polyv.net", "api": f"{env}-api.polyv.net", "liveJson": f"{env}-livejson.polyv.net",
            "player": f"{env}-player.polyv.net", "rtas": f"{env}-rtas.videocc.net", "rtasBackUp": f"{env}-rtas.videocc.net",
            "liveNormal": f"{env}-live-normal.polyv.net", "script": f"{env}-script.polyv.net",
        }

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
