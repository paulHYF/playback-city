"""命令行：导入频道、生成回放与城（比赛现场离线预生成），以及把旧的文件数据迁进库。

  uv run playback-city import <channelId> course|commerce
  uv run playback-city generate <fileId>          # 一讲：拉数据 + 生成 game.json
  uv run playback-city city <channelId>           # 整城：生成 city.json
  uv run playback-city migrate                    # data/*/game.json → 数据库
  uv run playback-city seed-runs <channelId>      # 用答题卡真实作答模拟闯关局，给大盘造演示数据
"""
import argparse
import asyncio

from app import db, repo
from app.config import get_settings
from app.pipeline import jobs
from app.pipeline.importer import import_channel, migrate_files
from app.polyv import PolyvClient


async def _import(a):
    async with PolyvClient(get_settings()) as c:
        print(await import_channel(c, a.channel_id, a.scene))


async def _generate(a):
    await jobs.generate_replay(a.file_id)
    r = repo.get_replay(a.file_id)
    print(r["game_status"], r["game_error"])


async def _city(a):
    await jobs.generate_city_job(a.channel_id)
    ch = repo.get_channel(a.channel_id)
    print(ch["city_status"], ch["city_error"], (ch["city_json"] or {}).get("name"))


async def _migrate(_):
    print(f"导入 {migrate_files()} 场")


async def _seed(a):
    from app.seed_runs import seed_runs
    print(seed_runs(a.channel_id))


def main():
    p = argparse.ArgumentParser(prog="playback-city")
    sub = p.add_subparsers(required=True)
    s = sub.add_parser("import", help="按频道号导入频道与回放列表")
    s.add_argument("channel_id")
    s.add_argument("scene", choices=["course", "commerce"])
    s.set_defaults(run=_import)
    s = sub.add_parser("generate", help="生成一讲的 game.json")
    s.add_argument("file_id")
    s.set_defaults(run=_generate)
    s = sub.add_parser("city", help="生成整城 city.json")
    s.add_argument("channel_id")
    s.set_defaults(run=_city)
    sub.add_parser("migrate", help="把 data/ 下的旧数据导进库").set_defaults(run=_migrate)
    s = sub.add_parser("seed-runs", help="模拟闯关局（演示用）")
    s.add_argument("channel_id")
    s.set_defaults(run=_seed)
    a = p.parse_args()
    db.init()
    asyncio.run(a.run(a))


if __name__ == "__main__":
    main()
