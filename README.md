# 回放不夜城 · playback-city

POLYV 2026 Hackathon（10.23–10.24）· 队伍「你说就你队」

把一场直播回放变成一座可以逛、可以闯的 3D 古城：回放列表是地上的楼阁广场，每一讲回放是一座地宫——大纲成殿室、题目成卷宗匣与门题、易混概念成双门、步骤成机关、直播里的易错点成怪物、全班最难的段落成 Boss、聊天里的高频问题成 NPC、没看过的段落是墨雾。答错就回看对应的回放片段才能再战，错题生成 D+1/3/7 复习计划。地宫有 11 套主题（宋风地宫、夜市、古墓、地牢、密室逃脱、鬼屋、佳节、藏经阁、墨家机关城、东海龙宫、敦煌石窟），AI 生成关卡配置，后台可调整。

两个场景共用一套引擎，只换提示词和皮肤：**课程培训**、**直播带货**。

只基于 POLYV 公开 OpenAPI 与开源 SDK 构建。

## 目录

| 路径 | 内容 |
|---|---|
| `backend/` | 服务端（Python · FastAPI）：调用直播开放接口拉取回放数据，按场景提示词调用大模型生成 `game.json`，见 [backend/README.md](backend/README.md) |
| `frontend/` | 前端（Vue 3 · Vite · TypeScript）：后台、入口页、讲义页、3D 游戏（Three.js），见 [frontend/README.md](frontend/README.md) |
| `doc/需求文档.html` | 完整需求文档（本地浏览器直接打开）：范围分档、game.json 结构、OpenAPI 清单、排期、构思记录、拓展方向 |
| `doc/assets/` | 主视觉海报 9:16；参赛封面 16:9 在 `doc/POLYV2026_Hackathon_封面_回放不夜城_宋风_16x9*.png` |
| `demo/` | 演示视频：`script.json` 分镜与旁白 · `record.mjs` 分段自动录屏 · `build.py` 配音 / 字幕 / 合成 · `cards.html` 片头片尾卡；成片在 `demo/out/回放不夜城-演示视频.mp4`。重录某段：`python3 demo/build.py tts <段>` → `node demo/record.mjs <段>` → `python3 demo/build.py seg <段>` → `python3 demo/build.py final` |
| `prototype/` | 单文件原型 v1（2D 像素）· v2（3D 石砖地宫）· v3（宋风地上广场 + 店铺经济 + 地下地宫），浏览器直接打开 |

## 本地启动

```bash
# 服务端（默认连测试环境 develop-3-api.polyv.net）
cd backend && cp .env.example .env && uv sync && uv run uvicorn app.main:app --reload --port 8000

# 前端（需要 Node 20+）
cd frontend && npm install && npm run dev   # http://localhost:5173 ，/admin 是后台；同时监听局域网，用本机 IP:5173 也能访问

# 可选：给三座测试城写入完整闯关配置（需后端已启动）
cd backend && uv run python seed/seed_worlds.py
```

仓库里带了当前 SQLite（`backend/data/playback-city.db`）和各城原始数据，clone 后直接起前后端就能看已导入的城、闯关和大盘。`.env` 仍不进仓库：没配密钥也能用库里的数据跑；要重新导入频道或走大模型生成，再复制 `.env.example` 填 POLYV / LLM 密钥。空库首次启动会自动导入 `backend/data/samples/` 里的离线样例。

流程：后台 `/admin`（城防列表）输入频道号导入 → 回放基础信息页逐讲「生成」→「生成整城」→（可选）在「游戏配置」里选主题、调整关卡 → 观众从首页城防舆图进 `/city/<频道号>` 闯关（自动领「夜巡人·xxxx」昵称） → 讲师看 `/dashboard/<频道号>`，点观众可进闯关明细。后台还可以查看观众闯关数据（`/admin/channels/<频道号>/viewers`）、直播原始数据（`/admin/channels/<频道号>/raw`），以及按培训、营销两个维度打分的直播质量分析报告（`/admin/channels/<频道号>/report`；直播看到场与流失，回放看补看与大家反复回看的重点段；AI 复盘点评写给讲师 / 主播本人，另有竹简长文版）。开发计划见 [doc/开发计划.md](doc/开发计划.md)。

## 原型 v3 怎么玩

方向键 / WASD 移动转身，Q E 侧移，面对建筑按前进交互。

1. 地面逛回放广场：楼阁层数 = 观看量，挂朱旗 = 已通关，门亮 = 可进
2. 进第 3 讲楼阁，下到地宫：开宝函答题、打镇墓兽、找书生灯影问话
3. 从月洞门出来，回到地面
4. 用地宫赚的铜钱去课程铺 / 道具铺 / 卷轴集市消费；玉璧代表掌握度，不可交易

经济红线：道具只帮你找到回放原文，不能替你答题。

## 成员

Paul（数据 / 提示词）· Bob（3D）
