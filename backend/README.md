# backend · 回放不夜城服务端

Python 3.11+ · FastAPI · uv

调用 POLYV 直播开放接口（默认测试环境 `develop-3-api.polyv.net`）拉取回放数据，按场景提示词调用大模型生成 `game.json`，供前端后台与游戏读取。

## 启动

```bash
cp .env.example .env      # 填 POLYV_APP_ID / POLYV_APP_SECRET / LLM_*
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
```

接口文档：http://localhost:8000/docs

## 目录

```
app/
├── main.py              FastAPI 入口；启动时建表，空库自动迁移 data/ 下旧数据
├── config.py            读取 .env
├── db.py                SQLite 建表与连接（data/playback-city.db）
├── repo.py              频道 / 回放读写
├── play.py              观众、闯关局、事件、回放播放区间；讲师大盘聚合
├── seed_runs.py         用答题卡真实作答人模拟闯关局（大盘演示数据）
├── storage.py           data/<gid>/raw 原始数据文件；data/channels/<cid>/ 频道级文件
├── rawdata.py           直播原始数据定位与读取（导入数据 + 每讲 raw，文件名白名单）
├── report.py            直播质量分析报告：直播 / 回放分开统计、重点回顾段、培训 / 营销双维度打分、诊断建议、AI 点评
├── cli.py               命令行：import / generate / city / migrate / seed-runs
├── polyv/               签名（含时钟偏差自动校准）、客户端、接口清单、SRT 解析
├── llm/client.py        OpenAI 兼容 chat/completions（JSON 输出）
├── pipeline/
│   ├── importer.py      按频道号导入：频道信息 + 回放列表 + 暂存列表 → 库，原始响应落 data/channels/<cid>/import/
│   ├── fetch.py         拉一讲的原始数据 → data/<gid>/raw/
│   ├── analyze.py       原始数据 + 提示词 → 大模型 → 校验 → game.json
│   ├── city.py          城级 city.json：城名、街道、楼名匾额、更夫台词（校验 + 兜底）
│   ├── jobs.py          后台生成任务（状态写库，前端轮询）
│   ├── assemble.py      观众端进城数据（城 + 楼阁 + 地宫 + 前人痕迹 + 字幕）
│   ├── schema.py        game.json 结构与校验规则（需求文档第 8 节）
│   └── prompts/         course.md · commerce.md · common.md
└── routers/
    ├── channels.py      /api/channels/import、/api/channels/{cid}、/raw、/raw/import/{name}、/report、/report/ai、/city（GET/PUT 整城配置调整）、/api/city/{cid}
    ├── replays.py       /api/replays/{rid}、/generate、/game（GET / PUT 后台调整）、/raw/{name}、/raw/refresh（只重拉原始数据）
    ├── viewers.py       /api/viewers、/{vid}/watch（播放区间）、/api/runs、/events、/finish
    └── dashboard.py     /api/dashboard/{cid}、/replays/{rid}
```

## 数据库（SQLite）

`channel`（城）· `replay`（一讲 = 楼阁 + 地宫，含 game_json）· `viewer`（浏览器首次进入发的观众 id）· `play_run`（一局）· `play_event`（闯关明细）· `viewer_replay`（每讲最好成绩）· `replay_watch`（回放城播放器里真实播放过的区间，质量报告算重点回顾段）。表结构见 `app/db.py`。

## 数据来源

| 用途 | 接口 | 文档 |
|---|---|---|
| 城名、主持人、头图 | `GET /live/v4/channel/basic/get` | live/api/v4/channel/operate/get_channel_detail |
| 回放广场楼阁 | `GET /live/v2/channel/recordFile/{channelId}/playback/list` | live/api/channel/playback/get_playback_list |
| 暂存文件 + 字幕地址 | `GET /live/v4/channel/record-file/list` | live/api/v4/channel/recordfile/page_record |
| 殿室、宝函（AI 大纲与测验） | `GET /live/v4/channel/record-file/subtitle/outline/get-by-fileId` | live/api/v4/channel/recordfile/get_record_file_outline |
| 触发 AI 大纲、回写回放打点 | `POST /live/v4/channel/record-file/subtitle/outline/create` | live/api/v4/channel/recordfile/create_record_file_outline |
| 书生灯影（高频问题） | `GET /live/v3/channel/chat/get-history-page` | live/api/chat/message/get_message_list |
| 书生灯影（提问） | `GET /live/v2/chat/{channelId}/getQuestion` | live/api/live_interaction/get_question_list |
| 楼高、墨雾 | `GET /live/v4/user/viewlog/list` | live/api/v4/user/viewlog/viewlog_list |
| 质量报告：直播 / 回放观看 | `GET /live/v2/statistics/{channelId}/viewlog`（`param3=live\|vod`） | 观看日志查询（v2 统计接口） |
| 殿室错误率、Boss、前人痕迹 | `GET /live/v3/channel/question/answer-records` | live/api/live_interaction/get_answer_list |

字幕没有单独的公开查询接口：暂存列表的 `contents[].subtitleList[].srtUrl` 文档没写，但接口实际返回，状态为 `finish` / `publish` 时可下载。
v2 观看日志一次播放一条，不能跨月查，`fetch.py` 按自然月切分；不返回回放播放进度，重点回顾段用回放城自己记录的播放区间。
回放列表的 `mp4` 带 1 天过期签名，播放优先用不过期的 `url`（m3u8，前端 hls.js）。

## 生成一座城

```bash
uv run playback-city import 8655755 course     # 导入频道与回放列表
uv run playback-city generate <fileId>          # 逐讲生成密室
uv run playback-city city 8655755               # 生成整城
uv run playback-city seed-runs 8655755          # （演示）模拟一批闯关局，大盘不空
```

或在前端后台 `/admin` 输入频道号导入，在回放基础信息页逐讲「生成」、再「生成整城」。
