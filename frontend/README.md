# frontend · 回放不夜城前端

Vue 3 · Vite · TypeScript · Element Plus（仅后台）· Three.js（仅游戏页）

## 启动

需要 Node 20+（见 `.nvmrc`）。开发时 `/api` 代理到 `http://localhost:8000`，先把 backend 跑起来。

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 构建
```

## 页面

| 路由 | 页面 |
|---|---|
| `/` | 城列表：已导入且有可闯讲次的频道 |
| `/city/:cid` | 观众端不夜城：地上回放广场（每讲一座楼阁）+ 地下密室闯关；首次进入领观众 id，闯关事件上报 |
| `/dashboard/:cid` | 讲师助教大盘：立体点亮城（每室一座楼，一扇窗一位观众）+ 漏斗、错误率、复活回看热度、错题榜、观众 |
| `/handout/:id` | 讲义 / 卖点卡 |
| `/admin/channels` | 后台：输入频道号导入，已导入的城 |
| `/admin/channels/:cid` | 后台：回放基础信息页，逐讲生成密室、生成整城 |
| `/admin/replays/:id` | 后台：预览 game.json |

## 目录

```
src/
├── api/            后端接口封装
├── types/          game.ts（game.json）· city.ts（城、回放、大盘）
├── viewer.ts       观众 id（localStorage）与闯关事件批量上报
├── game/
│   ├── nightcity/  夜巡引擎：自 prototype/v5-夜巡.html 搬入（JS，three r128）；video.js 用 hls.js 播 m3u8
│   └── skyline/    讲师大盘立体点亮城（three r128）
├── views/          页面；admin/ 为后台
└── styles/         宋风配色
```

three 固定在 0.128：原型就是 r128，r155 之后光照单位与色彩管理都变了，升级要重调灯光与材质。
