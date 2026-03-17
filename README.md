# 归隅 / Nookbound

归隅（`Nookbound`）是一个基于三角晶格的浏览器拼图游戏。它是个纯静态网页项目，整体想做得安静一点，像一件可以慢慢摆弄的逻辑玩具。

在线地址：[https://nookbound.pages.dev/](https://nookbound.pages.dev/)

## 关于这个项目

这个仓库不依赖前端框架。构建时做的事情也很直接：把发布需要的静态资源整理到 `dist/`，然后交给 Cloudflare Pages。

现在站点已经部署在 Cloudflare Pages，这份 README 主要留一下项目本身的结构、本地运行方式，以及仓库里正在用的发布说明。

## 本地运行

先构建：

```bash
npm run build
```

构建产物会输出到 `dist/`。

本地预览时，直接起一个静态服务器看 `dist/` 就可以。这里保留目前在用的两种方式：

```bash
npx wrangler pages dev dist
```

或：

```bash
python -m http.server 4175 --directory dist
```

## 项目结构

```text
index.html          入口页面
css/style.css       样式
js/                 游戏逻辑、关卡数据、音频与交互
scripts/build.mjs   静态构建脚本
dist/               构建产物
```

## 部署

项目当前部署在 Cloudflare Pages，仓库里也保留了两种发布方式的说明。

### GitHub 集成

Cloudflare Pages 这边使用的构建配置是：

- Framework preset: `None`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: 留空或 `/`

首次部署完成后，Cloudflare 会分配一个 `*.pages.dev` 域名。

### Wrangler 直传

仓库里带着 `wrangler.toml`，当前相关配置如下：

```toml
pages_build_output_dir = "./dist"
compatibility_date = "2026-03-16"
```

如果走 Wrangler，命令是：

```bash
npx wrangler pages deploy dist
```

第一次在本地使用前，需要先登录：

```bash
npx wrangler login
```

## 发布前检查

- 跑一遍 `npm run build`
- 本地打开 `dist/`，把桌面端和移动端拖拽过一遍
- 检查中英文切换、设置菜单、提示、重开、返回选关
- 确认 Cloudflare Pages 项目的 Production branch 指向 `main`
