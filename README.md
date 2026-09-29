# Glimpse

随手探索，感兴趣就多停一下，随时可以离开。

[打开应用](https://kokoirin.github.io/Glimpse/) · [RIN III 项目介绍](https://kokoirin.github.io/rin3/me/glimpse/)

## 内容和记录

- 游客浏览全部轻松内容（生活场景与轻量心理学）；登录后加入计算机、数学知识卡。顶部不再要求选择模式，登录用户可在菜单切换“只看轻松内容”。
- 从云端共享内容库准备每一轮，最多 14 张。左右切换、点开体验，随时结束。
- 卡片真正显示在前台时记为“浏览过”，不必点开。每轮先选未浏览内容；新卡不足 14 张时这一轮会较短，全部浏览后再从历史随机选。未展示的预选卡不会被标记。
- 已浏览状态长期保存在个人记录中，独立于最多 2,000 条的本机日志；登录后随账号同步。卡片修改版本保留已浏览状态，新 ID 才视为新卡。
- 卡片独立发布，无需重新部署网页。已经开始的一轮保持原来的内容和顺序。
- 未登录时记录保存在本机；通过 Google 登录后，同步已浏览状态、打开记录和明确的喜欢、不感兴趣或撤销评价。
- 同一账号跨设备同步，不同账号数据隔离。网络失败时操作等待重试，不把本地标记误报成云端已保存。
- 首次登录可选择合并旧记录。逐次浏览和停留等详细日志仅在本机保留，不参与云端同步。
- 可添加到主屏幕。目前仍需联网加载应用；内容缓存不等于支持完整离线启动。

## 当前登录范围

当前仅供维护者本人登录。Supabase 的 `Allow new users to sign up` 已关闭，账号列表核对为唯一的本人 Google 账号；未登录访客仍可浏览并在本机保存记录。不要手工创建其他账号，以免扩大当前登录范围。

以后明确需要开放时，再开启该注册开关。Google OAuth 已处于正式版，且只登记 openid、email、profile；实际能否进入 Glimpse 由 Supabase 的账号准入控制，不能只依赖 Google 测试用户名单。

## 本地开发

需要 Node.js 22.13 或更新版本。

```sh
npm ci
cp .env.example .env.local
# 示例已含公开连接配置；普通前端开发无需管理密钥。
npm test
npm run dev
```

换电脑时，安装上述 Node.js 版本，克隆本仓库后执行这些命令即可。`.env.example` 已包含当前服务的公开地址和 publishable key；不要把管理密钥填进这个示例文件。内容库、Google 登录配置和账号记录都保留在云端，无需重新创建。只有批量发布卡片时，才需要从 Supabase 控制台取得管理密钥并填入被忽略的 `.env.local`。不要通过提交文件迁移密钥。

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

`energy: "low"` 是对游客公开的轻松内容，`energy: "high"` 是登录后的领域知识。数据库权限与本机缓存都按这个范围隔离；发布时务必核对分类。`content/2026-09-29-exploration.json` 新增 14 张（计算机 4、数学 4、心理学 3、生活 3）。

`content/initial-cards.json` 只用于首次导入，网页部署不会再次导入它。批量更新不要求提交或推送 GitHub。内容记录采用纯文本及已支持的互动类型，不执行远程脚本。

## 测试与发布

- `npm test`：内容、导航、控制器、同步、登录回调和真实 PostgreSQL 权限测试。
- `npm run test:database`：用嵌入式 PostgreSQL 执行实际迁移，验证权限和事务；不连接生产数据库。
- `npm run test:build`：构建后检查 Pages 子路径、资源和发布范围。
- 推送 main 后运行检查、构建，只发布 `dist/`。管理密钥、迁移、测试和本地环境文件不会发布。

## 从 RIN III 迁入

应用最初迁自 `KokoiRin/rin3` 的 `cb37067`。RIN III 介绍页与旧入口继续保留。现有 `glimpse-records-v1` 作为游客记录读取；已有记录可在 Google 登录后合并。`rin-glimpse-events-v1` 中的操作日志仍仅在原浏览器中保留。
