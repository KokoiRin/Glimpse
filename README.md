# Glimpse

随手探索，感兴趣就多停一下，随时可以离开。

[打开应用](https://kokoirin.github.io/Glimpse/) · [RIN III 项目介绍](https://kokoirin.github.io/rin3/me/glimpse/)

## 内容和记录

- 从云端共享内容库准备每一轮，最多 14 张。左右切换、点开体验，随时结束。
- 卡片独立发布，无需重新部署网页。已经开始的一轮保持原来的内容和顺序。
- 未登录时记录保存在本机；通过 Google 登录后，同步打开记录和明确的喜欢、不感兴趣或撤销评价。
- 同一账号跨设备同步，不同账号数据隔离。网络失败时操作等待重试，不把本地标记误报成云端已保存。
- 首次登录可选择合并旧记录。浏览和停留等操作日志仅在本机保留，不参与云端同步。
- 可添加到主屏幕。目前仍需联网加载应用；内容缓存不等于支持完整离线启动。

## 本地开发

需要 Node.js 22.13 或更新版本。

```sh
npm ci
cp .env.example .env.local
# 填入项目 URL 和公开 publishable key。
npm test
npm run dev
```

预览地址：http://localhost:4173/Glimpse/。`PORT` 可调整预览端口；新的端口也需加入登录回跳地址白名单。`npm run build` 把原生 JavaScript 与 Supabase SDK 打包到 `dist/`。

首次服务配置和上线步骤见 [部署说明](docs/deployment.md)。缺少公开项目配置时构建会失败，防止发布无法登录和读取内容的版本。

## 更新卡片

准备 JSON 文件，格式为 `{ "cards": [...], "unpublish": ["卡片ID"] }`。新增、修改的卡片放入 cards；下架 ID 放入 unpublish。修改内容时增加 version，不改变同一张卡片的 id。

```sh
# 先校验，不修改云端
npm run content:publish -- --file content/initial-cards.json
# 使用本地管理凭据，整批事务发布
npm run content:publish -- --file 内容.json --publish
```

`content/initial-cards.json` 只用于首次导入，网页部署不会再次导入它。批量更新不要求提交或推送 GitHub。内容记录采用纯文本及已支持的互动类型，不执行远程脚本。

## 测试与发布

- `npm test`：内容、导航、控制器、同步、登录回调和真实 PostgreSQL 权限测试。
- `npm run test:database`：用嵌入式 PostgreSQL 执行实际迁移，验证权限和事务；不连接生产数据库。
- `npm run test:build`：构建后检查 Pages 子路径、资源和发布范围。
- 推送 main 后运行检查、构建，只发布 `dist/`。管理密钥、迁移、测试和本地环境文件不会发布。

## 从 RIN III 迁入

应用最初迁自 `KokoiRin/rin3` 的 `cb37067`。RIN III 介绍页与旧入口继续保留。现有 `glimpse-records-v1` 作为游客记录读取；已有记录可在 Google 登录后合并。`rin-glimpse-events-v1` 中的操作日志仍仅在原浏览器中保留。
