# NOVA 星流创作台

一个面向视觉创作者的 AIGC 前端概念项目，包含图片生成工作台与节点式无限画布。当前版本使用本地模拟数据，适合继续接入真实的图片生成 API。

## 功能

- 首页快速创作、最近项目和灵感筛选
- 文生图 / 图生图参数面板、生成进度、结果收藏与下载
- 可拖拽、缩放、连线和添加节点的无限画布
- 节点属性编辑、删除、工作流 JSON 导出与分享链接复制
- 桌面、平板和移动端响应式布局

## 本地运行

```bash
npm install
npm run dev
```

构建与检查：

```bash
npm run lint
npm run build
```

## 技术栈

React 19、TypeScript、Vite、React Router、React Flow、Lucide Icons。

## 部署

推送到 `main` 分支后，GitHub Actions 会构建并发布到 GitHub Pages。


## .NET API

前端图片生成已接入 `backend/` 下的 .NET 洋葱架构 API。

```powershell
cd backend
dotnet run --project src/Nova.Api
```

API 默认监听 `http://localhost:5070`，会调用本机 `C:\Users\82742\.agents\scripts\custom_imagegen.py`。如需调整路径，修改 `backend/src/Nova.Api/appsettings.json`。
