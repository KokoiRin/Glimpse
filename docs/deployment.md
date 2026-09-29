# 服务与部署

## Supabase

1. 在自己的组织中创建 Glimpse 项目，关闭自动向访客开放新表。
2. 首次部署按文件名顺序执行 `supabase/migrations/` 中的 SQL。已有项目只执行尚未应用的迁移，不重复创建表。`202609290001_guest_content.sql` 将游客读取限制为已发布的 `energy=low` 内容。
3. Auth 启用 Google。生产 Site URL 为 `https://kokoirin.github.io/Glimpse/`；Redirect URLs 精确加入该地址和 `http://localhost:4173/Glimpse/`。保留需要的本地测试地址，不使用通配的外部回跳地址。
4. 不启用其他注册方式。访客无须创建匿名账号，可以直接读取已发布的轻松卡片。
5. 把 Project URL 和 publishable key 填入本地 `.env.local`，并作为同名 GitHub Actions repository variables 配置：`GLIMPSE_SUPABASE_URL`、`GLIMPSE_SUPABASE_PUBLISHABLE_KEY`。
6. 本地批量发布使用 `.env.local` 中的 `SUPABASE_SECRET_KEY`（或旧项目的 `SUPABASE_SERVICE_ROLE_KEY`）。只保存在受限的本地环境文件，不放进 GitHub、浏览器或构建变量。
7. 校验并手动发布 `content/initial-cards.json` 一次。以后只发布需要修改的批次。

已发布的轻松卡片允许访客读取；领域知识只向已登录账号开放；草稿不开放。个人表只允许当前账号读取，修改通过校验登录身份的函数执行。重试去重表不对浏览器开放。RPC 的用户参数必须与认证身份一致，防止切换账号时旧请求误写新账号。

## Google Auth Platform

1. 为 Glimpse 使用独立的 Google Cloud 项目，受众选择外部。
2. OAuth 客户端类型选择 Web application。JavaScript origins 配置 `https://kokoirin.github.io` 和开发时的 `http://localhost:4173`。
3. Authorized redirect URI 使用 Supabase Google provider 页面给出的 `https://<project-ref>.supabase.co/auth/v1/callback`；它不同于登录完成后回到 Glimpse 的地址。
4. Client ID 和 Client Secret 填入 Supabase Google provider。Client Secret 只留在服务端配置中。
5. 仅使用 openid、email、profile。首页为 `https://kokoirin.github.io/Glimpse/`，隐私说明为 `https://kokoirin.github.io/Glimpse/privacy.html`。
6. 先验证真实账号回调，再将受众发布到生产。仅添加测试账号不等于已对所有 Google 账号开放。若平台要求验证或条款确认，完成对应步骤后再报告登录上线。

## 发布与回退

先迁移数据库并导入内容，再配置公开构建变量、测试 Google 回调，最后推送 main。Pages 工作流不会修改数据库，也不会把初始卡片重新写回云端。

上线后验证：访客获取卡片、Google 登录、两台设备同步、另一个账号隔离，以及不提交代码即可发布新版本卡片。自动化使用 PGlite 验证实际数据库规则；Google 的真实登录必须额外在浏览器完成，不能用本地 fixture 替代。

紧急回退时重新部署最后一个正常的前端提交；保留云端表和用户记录，不通过删除数据库回退。

## 本机与账号记录

游客记录只在明确选择合并后上传。合并有持久化转移日志和幂等操作 ID，即使中途刷新或网络中断也不会重复累加。云端已有评价（包括明确取消的评价）优先于旧记录。

退出账号会立即停止展示它的记录。它尚未同步的队列保留在该账号自己的本机缓存里，下一次登录此账号后继续处理。不同账号的缓存、队列及操作日志独立。

清除账号的本机缓存前先确认队列已同步；待同步时不执行清理。云端记录保留，重新同步后恢复。此入口不承担删除云端账号数据的功能。

## Provisioned services and verification (2026-09-28)

- Supabase: cwixbyldslmxemgbjace, Glimpse Free organization, Singapore. Initial migration and original 14 cards are applied; do not rerun table creation.
- Google Cloud: calm-metric-510010-i9. Web OAuth client connected to Supabase. Google enabled; email/password signup disabled.
- Chrome localhost: real Google callback succeeded, URL cleaned, account synced; like and clear verified.
- Live backend: isolated temporary accounts, independent sessions of one account, like/dislike/clear, idempotent retry, rejected cross-account requests and unauthorized content writes. Temporary users were removed.
- Live content publisher: temporary card created, updated, then unpublished without deploying code. Existing round retained its snapshot; a subsequent load read the update. Original 14 cards remain published.
- Management key is only in ignored local .env.local with mode 600. Frontend uses the publishable key.
- Google branding home/privacy URLs and basic scopes saved; OAuth audience is Production. Supabase disable_signup=true restricts Glimpse to its single existing owner account.
- GitHub Pages deployment 36410431114 succeeded for c75ff76; live index/app/privacy matched the tested build. Production-site Google sign-in, sign-out and sign-in again succeeded after signups were disabled, with account status synced.

## 当前登录范围

当前仅供维护者本人登录。Supabase 的 `Allow new users to sign up` 已关闭，账号列表核对为唯一的本人 Google 账号；未登录访客仍可浏览并在本机保存记录。不要手工创建其他账号，以免扩大当前登录范围。

以后明确需要开放时，再开启该注册开关。Google OAuth 已处于正式版，且只登记 openid、email、profile；实际能否进入 Glimpse 由 Supabase 的账号准入控制，不能只依赖 Google 测试用户名单。


## 内容范围更新（2026-09-29）

- 已应用 `202609290001_guest_content.sql`：anon 只能读已发布 low 卡片，authenticated 可以读全部已发布卡片。未改动账号准入和个人数据权限。
- 已事务发布 `content/2026-09-29-exploration.json` 的 14 张新卡片。数据库核对 high 16、low 12，共 28 张；公开接口验证仅返回 12 张 low，包括 3 张心理学卡。
- 手机尺寸 390×844 验证游客菜单、有限卡组。发布前已开始的一轮仍为 6 张，下一轮读到 12 张，含全部新增心理学卡。
- 内容缓存按游客或账号隔离；旧缓存用于游客时只保留 low。退出或账号切换立即清除当前卡片及详情并重新取内容；同账号续期不打乱当前轮。
- 顶部模式按钮移除。登录用户在菜单切换只看轻松内容；默认加入领域知识。本版仍为有限随机探索，不声称已实现个性化推荐算法。

## 不通过网页更新数据库

项目固定使用官方 Supabase CLI 2.118.0，`npm ci` 会一并安装。内容发布与数据库结构迁移是两条独立流程，不需要 Docker，也不需要重新部署网页。

- 更新卡片：`npm run content:publish -- --file content/2026-09-29-light-100.json` 校验；加 `--publish` 才写入内容库。
- 一次性登录 CLI：`npm run db:login`。按官方登录流程授权；不把访问令牌或数据库密码提交到仓库。必要时在终端提示中输入数据库密码。
- 查看迁移历史：`npm run db:status`。
- 预览待执行结构变更：`npm run db:preview`。
- 测试并审阅预览后执行：`npm run db:publish`。只应用待执行的迁移，不导入种子卡片、不修改远端 Auth 配置或 Vault。

这些命令明确指向 Glimpse 项目 `cwixbyldslmxemgbjace`。当前机器尚未完成 CLI 登录，命令入口可用不代表已取得数据库连接权限。

### 接管已有数据库的迁移历史（只做一次）

以下三个迁移已通过 SQL Editor 成功执行，因此首次切换到 CLI 时，不能重新运行它们。先核对远端结构，再运行：

```sh
npx supabase migration repair 202609280001 202609290001 202609290002 --status applied --project-ref cwixbyldslmxemgbjace
npm run db:status
npm run db:preview
```

`migration repair` 只登记历史，不执行 SQL；仅能用于已经核实在远端生效的版本。首次预览应没有待执行迁移。以后新增 `supabase/migrations/` 文件，测试后用 `db:preview` 和 `db:publish`，不再手工编辑远端结构。

官方依据：[数据库迁移](https://supabase.com/docs/guides/deployment/database-migrations) · [CLI db push](https://supabase.com/docs/reference/cli/supabase-db-push)。

## 100 张轻松内容与浏览优先（2026-09-29）

`202609290002_seen_records.sql` 新增 `seen_at`，从已有打开和评价记录回填。新增 seen 操作支持重试去重及账号隔离，不增加打开次数或更改评价。游客合并包含仅浏览过的卡片。

新增 `content/2026-09-29-light-100.json`，五类各 20 张：身边观察、原创微故事、日常感受、文字小趣、想象漫游。全部属于 low。内容库总计 128 张，其中轻松内容 112 张，知识卡 16 张。

首轮和下一轮取内容时先同步个人记录，再筛选未浏览卡片；不存在未浏览卡片时才从历史随机选择。记录按卡片 ID 判断，修改内容版本不重置；不感兴趣的卡片继续排除。已开始的一轮不因后台同步而重排。只在页面前台且卡片未被对话框遮挡时记为浏览；未展示的预选卡片不计入。

旧的打开和评价记录可直接作为已浏览依据；本机仍保留的历史 impression 日志也会补入当前游客或账号记录。早于旧日志保留范围、且没有打开或评价的浏览历史无法完整恢复。从本版开始，已浏览状态不再依赖日志保留条数。

验收记录：本地 390×844 手机页面连续两轮各浏览 14 张，第二轮与第一轮没有重复；历史中的“浏览过”和“点开过”分开展示。自动化覆盖 100 张依次浏览后才进入随机回看、后台预加载不计浏览、跨设备首轮等待同步、离线重试及账号隔离。CLI 的 db:preview 已运行到认证检查，当前提示缺少访问令牌，未执行远端结构变更。
