# 服务与部署

## Supabase

1. 在自己的组织中创建 Glimpse 项目，关闭自动向访客开放新表。
2. 在 SQL Editor 执行 `supabase/migrations/202609280001_glimpse.sql`。这是首次迁移；不要对已有同名表直接重复执行。
3. Auth 启用 Google。生产 Site URL 为 `https://kokoirin.github.io/Glimpse/`；Redirect URLs 精确加入该地址和 `http://localhost:4173/Glimpse/`。保留需要的本地测试地址，不使用通配的外部回跳地址。
4. 不启用其他注册方式。访客无须创建匿名账号，可以直接读取已发布卡片。
5. 把 Project URL 和 publishable key 填入本地 `.env.local`，并作为同名 GitHub Actions repository variables 配置：`GLIMPSE_SUPABASE_URL`、`GLIMPSE_SUPABASE_PUBLISHABLE_KEY`。
6. 本地批量发布使用 `.env.local` 中的 `SUPABASE_SECRET_KEY`（或旧项目的 `SUPABASE_SERVICE_ROLE_KEY`）。只保存在受限的本地环境文件，不放进 GitHub、浏览器或构建变量。
7. 校验并手动发布 `content/initial-cards.json` 一次。以后只发布需要修改的批次。

已发布卡片允许访客读取；草稿不开放。个人表只允许当前账号读取，修改通过校验登录身份的函数执行。重试去重表不对浏览器开放。RPC 的用户参数必须与认证身份一致，防止切换账号时旧请求误写新账号。

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
- Google production audience and Pages delivery must be confirmed separately; localhost success alone does not establish public availability.
