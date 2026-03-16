# 归隅

归隅（`Nookbound`）是一个基于三角晶格的静态网页拼图游戏。当前仓库不依赖框架构建，发布时只需要把静态资源整理到 `dist/` 并部署到静态托管平台。

## 本地运行

### 1. 构建

```bash
npm run build
```

构建完成后，发布产物会输出到 `dist/`。

### 2. 本地预览

任选一种静态服务器方式：

```bash
npx wrangler pages dev dist
```

或：

```bash
python -m http.server 4175 --directory dist
```

## 项目结构

- `index.html`：入口页面
- `css/style.css`：样式
- `js/`：游戏逻辑、关卡数据、音频、题解与交互
- `scripts/build.mjs`：静态构建脚本
- `dist/`：构建产物目录

## 部署到 Cloudflare Pages

### 方案一：GitHub 集成部署

1. 把仓库 push 到 GitHub。
2. 在 Cloudflare Dashboard 中创建 Pages 项目并连接该仓库。
3. 构建设置填写：
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: 留空或 `/`
4. 首次部署完成后，Cloudflare 会生成 `*.pages.dev` 域名。

### 方案二：Wrangler 直接部署

仓库已包含 `wrangler.toml`：

- `pages_build_output_dir = "./dist"`
- `compatibility_date = "2026-03-16"`

直接部署时可使用：

```bash
npx wrangler pages deploy dist
```

首次使用需要先登录 Cloudflare：

```bash
npx wrangler login
```

## 上线前检查建议

- 运行 `npm run build`
- 本地打开 `dist/` 做一次桌面端和移动端拖拽回归
- 检查中英文切换、设置菜单、题解、重开、返回选关
- 确认 Cloudflare Pages 项目 Production branch 指向 `main`
