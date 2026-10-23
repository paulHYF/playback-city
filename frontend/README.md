# frontend · 回放不夜城前端

Vue 3 · Vite · TypeScript · Element Plus（仅后台）· Three.js（仅游戏页）

## 启动

需要 Node 20+（见 `.nvmrc`）。开发时 `/api` 代理到 `http://localhost:8000`，先把 backend 跑起来。

```bash
npm install
npm run dev        # http://localhost:5173 ，同时监听 0.0.0.0，局域网用本机 IP:5173 也能进；/api 代理到本机后端
npm run build      # 类型检查 + 构建
```

## 页面

| 路由 | 页面 |
|---|---|
| `/` | 城防舆图（观众端）：一个频道一座城，驿道相连；按当前观众进度标未至 / 在攻 / 已克，点城看城志、入城。游戏里「出城」回到这里并选中刚出来的城 |
| `/city/:cid` | 观众端不夜城：地上回放广场（每讲一座楼阁）+ 地下密室闯关（11 套主题、10 种殿室机制、门题与道具链、破惑对决、巡夜怪、左上角本室任务面板）；首次进入领观众 id，闯关事件上报，刷新可接着打 |
| `/dashboard/:cid` | 讲师助教大盘：立体点亮城（每室一座楼，一扇窗一位观众）+ 漏斗、错误率、复活回看热度、错题榜、观众；点观众或「观众闯关数据」进后台明细 |
| `/handout/:id` | 讲义 / 卖点卡 |
| `/admin/channels` | 后台「城防列表」：输入频道号导入；已导入的城（按场景筛选，操作列进管理、游戏配置下拉、原始数据、质量报告、进城） |
| `/admin/channels/:cid` | 后台：回放基础信息页，逐讲生成密室、生成整城，调整整城配置（城名、街道、楼名匾额、更夫） |
| `/admin/channels/:cid/viewers` | 后台：本城观众闯关数据（自动昵称、局数、通关、积分、每局事件时间线） |
| `/admin/channels/:cid/raw` | 后台：直播原始数据（导入数据 + 每讲观看、聊天、答题卡、问卷等），表格 / JSON 查看与下载 |
| `/admin/channels/:cid/report` | 后台：直播质量分析报告，培训 / 营销双维度得分、诊断建议、逐讲明细、AI 复盘点评（按场景单视角，写给讲师 / 主播） |
| `/admin/channels/:cid/report/scroll` | 后台：质量报告竹简版，大模型写成的复盘长文，竖排 / 横排阅读 |
| `/admin/replays/:id` | 后台：单讲游戏配置——殿室与题目、闯关配置（主题选择与贴图预览、殿室机制、门题与道具、Boss、NPC）、高频问题、易混、讲义、JSON，可调整保存（服务端校验） |

## 目录

```
src/
├── api/            后端接口封装
├── types/          game.ts（game.json）· city.ts（城、回放、大盘）
├── viewer.ts       观众 id（localStorage）与闯关事件批量上报
├── game/
│   ├── nightcity/  夜巡引擎（JS，three r128）：engine.js 广场 + 地宫 + 殿室机制 + 破惑对决 + 任务面板；
│   │               themes.ts 11 套地宫主题；props.js 氛围摆件；beasts.js 各主题怪物外形；liveplayer.js 回放播放器
│   └── skyline/    讲师大盘立体点亮城（three r128）
├── views/          页面；admin/ 为后台
└── styles/         宋风配色
```

three 固定在 0.128：原型就是 r128，r155 之后光照单位与色彩管理都变了，升级要重调灯光与材质。
