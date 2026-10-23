"""往测试环境 live_analytics.viewlog_{yyyyMM} 写观看记录（直播 + 回放），供 /live/v4/user/viewlog/list 查询。

真实观看记录要约 3 小时才入库，造数直接插测试库；数据源从测试 Apollo user-service druid.yml 的 live-analytics 查得。
造的记录 param5='bny_seed'，清理：python seed/viewlog.py <scene> --clean

  python seed/viewlog.py course          # 生成并写入
  python seed/viewlog.py course --dry-run
"""
import json
import os
import random
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).parent
MARK = "bny_seed"
USER_ID = "0f9d966433"


def mysql(sql: str):
    env = {**os.environ, "MYSQL_PWD": os.environ["TEST_LIVE_DB_PASS"]}
    return subprocess.run(["mysql", "--connect-timeout=10", "-h", os.environ["TEST_LIVE_DB_HOST"], "-P", os.environ["TEST_LIVE_DB_PORT"],
                           "-u", os.environ["TEST_LIVE_DB_USER"], "live_analytics", "-e", sql],
                          check=True, capture_output=True, text=True, env=env).stdout


def q(v) -> str:
    return "NULL" if v is None else "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


def rows(scene: str) -> tuple[str, list[dict]]:
    state = json.loads((HERE / "out" / scene / "state.json").read_text("utf-8"))
    channel = json.loads((HERE / "channels.json").read_text("utf-8"))[scene]["channelId"]
    duration = int(json.loads((HERE / "out" / scene / "timeline.json").read_text("utf-8"))["duration"])
    viewers = [line.split(maxsplit=1) for line in (HERE / f"{scene}_viewers.txt").read_text("utf-8").splitlines() if line.strip()]
    live_start = datetime.fromtimestamp(state["liveStart"] / 1000)
    rnd = random.Random(channel)
    out = []

    def add(vid, nick, kind, start, seconds):
        seconds = max(30, min(duration, int(seconds)))
        ms = int(start.timestamp() * 1000)
        out.append({
            "playId": f"{ms}X{rnd.randint(1000000, 9999999)}", "userId": USER_ID, "channelId": channel,
            "playDuration": seconds, "stayDuration": seconds + rnd.randint(5, 40), "flowSize": 0,
            "sessionId": state["sessionId"], "param1": vid, "param2": nick, "param3": kind, "param4": "", "param5": MARK,
            "ipAddress": f"10.{rnd.randint(0, 255)}.{rnd.randint(0, 255)}.{rnd.randint(1, 254)}",
            "country": "中国", "province": rnd.choice(["广东", "北京", "上海", "浙江", "四川", "湖北", "江苏"]), "city": "", "isp": "电信",
            "operatingSystem": rnd.choice(["Windows", "Mac OS X", "iOS", "Android"]), "browser": rnd.choice(["Chrome", "Safari", "WeChat"]),
            "isMobile": rnd.choice("NNY"), "currentDay": start.strftime("%Y-%m-%d"),
            "createdTime": start, "lastModified": start + timedelta(seconds=seconds), "ptype": 0, "trackFrom": "",
            "firstActiveTime": start, "lastActiveTime": start + timedelta(seconds=seconds), "productLine": "live",
        })

    # 直播：聊天里出现过的观众都在直播间；约四分之一中途离开
    for i, (vid, nick) in enumerate(viewers):
        join = rnd.randint(0, 40)
        stay = duration - join if i % 4 else duration * rnd.uniform(0.35, 0.7)
        add(f"bny_{vid}", nick.strip(), "live", live_start + timedelta(seconds=join), stay)
    # 回放：观看时间分散在直播后当天到一周多，但不晚于现在
    replay_start = live_start + timedelta(seconds=duration, minutes=5)
    later = lambda days, minutes: min(replay_start + timedelta(days=days, minutes=minutes), datetime.now() - timedelta(minutes=5))
    # 直播中途离开的人里，大部分回来补看后半段
    for i, (vid, nick) in enumerate(viewers):
        if i % 4 == 0 and i % 8 != 4:
            add(f"bny_{vid}", nick.strip(), "vod", later(i % 3, i * 7), duration * rnd.uniform(0.4, 0.7))
    # 另一批只看回放的观众，覆盖率 30%–100%，体现「墨雾」；前 4 位隔天又看了一遍
    for k, ratio in enumerate([1.0, 1.0, 0.95, 0.85, 0.7, 0.62, 0.55, 0.48, 0.4, 0.33, 0.3, 1.0]):
        vid, nick, days = f"bny_r{k + 1:02d}", f"回放观众{k + 1}", [0, 0, 1, 2, 3, 5, 6, 9][k % 8]
        add(vid, nick, "vod", later(days, k * 11), duration * ratio)
        if k < 4:
            add(vid, nick, "vod", later(days + 1, k * 13), duration * rnd.uniform(0.2, 0.5))
    return out


def main():
    scene, flags = sys.argv[1], sys.argv[2:]
    data = rows(scene)
    channel = data[0]["channelId"]
    tables: dict[str, list[dict]] = {}  # 按观看时间所在月份分表
    for r in data:
        tables.setdefault(f"viewlog_{r['createdTime']:%Y%m}", []).append(r)
    cols = list(data[0])
    for table, part in tables.items():
        if "--clean" in flags:
            mysql(f"DELETE FROM {table} WHERE channelId={channel} AND param5='{MARK}'")
            print("已清理", table, channel)
            continue
        values = ",\n".join("(" + ",".join(q(r[c].strftime('%Y-%m-%d %H:%M:%S') if isinstance(r[c], datetime) else r[c]) for c in cols) + ")" for r in part)
        sql = (f"DELETE FROM {table} WHERE channelId={channel} AND param5='{MARK}';\n"
               f"INSERT INTO {table} ({','.join(cols)}) VALUES\n{values};")
        if "--dry-run" in flags:
            print(sql[:1500])
            continue
        mysql(sql)
        print(table, mysql(f"SELECT param3, COUNT(*) n, ROUND(AVG(playDuration)) avg_s FROM {table} WHERE channelId={channel} AND param5='{MARK}' GROUP BY param3"))


if __name__ == "__main__":
    main()
