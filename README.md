# Glimpse

随手探索，感兴趣就多停一下，随时可以离开。

- [打开应用](https://kokoirin.github.io/Glimpse/)
- [RIN III 项目介绍](https://kokoirin.github.io/rin3/me/glimpse/)

## 体验

一屏一张卡，左右滑动或点击箭头切换。打开感兴趣的内容，继续深入或随时退出。当前有 8 张计算机与数学卡和 6 张生活体验卡，每轮有限，不自动无限推荐。

支持「轻松点」、看过记录、喜欢 / 不感兴趣、记录导出和清除。记录只保存在当前浏览器，不上传、不跨设备同步。可以添加到主屏幕，目前仍需联网，不支持离线。

## 本地开发

需要 Node.js 22.13 或更新版本，无需安装依赖。

```sh
npm test
npm run dev
```

打开 http://localhost:4173/Glimpse/。可以通过 `PORT` 调整端口。

## 文件与部署

- `public/`：完整的静态应用和独立的安装清单。
- `tests/`：卡片、导航、反馈、控制器与部署资源检查。
- `scripts/serve.mjs`：仅供本地预览的静态服务。
- `.github/workflows/deploy-pages.yml`：推送 main 后运行测试，仅发布 public 到 GitHub Pages。

## 从 RIN III 迁入

应用迁自 `KokoiRin/rin3` 的 `cb37067`，原目录为 `public/apps/glimpse/`。介绍页继续保留在 RIN III，旧应用地址跳转到本项目。

保留原有 `rin-glimpse-events-v1` 和 `glimpse-records-v1` 存储键。新旧 GitHub Pages 地址同属 `https://kokoirin.github.io`，在同一浏览器存储环境中可继续读取既有记录；换浏览器、设备或域名不会自动迁移。主屏幕独立应用是否沿用 Safari 数据取决于系统的存储隔离方式。
