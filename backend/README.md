# Nova API

这是一个最小可运行的 .NET 洋葱架构后端：

- `Nova.Domain`：生成请求与结果契约
- `Nova.Application`：`IImageGenerationService` 用例抽象
- `Nova.Infrastructure`：调用本机 `custom_imagegen.py` 的 Provider
- `Nova.Api`：HTTP API、CORS、健康检查

## 运行

```powershell
dotnet run --project src/Nova.Api
```

默认监听 `http://localhost:5070`，前端通过 `POST /api/images/generations` 调用。

## 能力与参数

- GET /api/images/capabilities 返回可用的 provider、model、ratio 和数量范围。
- 当前支持 local-gpt-image / gpt-image-2；不支持的模型、提供方、比例和数量返回 400，不会默默使用其他配置。
- prompt 最多 12000 字符，style 最多 200 字符。数量省略时为 1，接口范围 1–8，当前 UI 固定为单张。
- 比例传入包装脚本的 --size：1:1 → 1024x1024，16:9 → 1536x864，9:16 → 864x1536，4:3 → 1024x768，3:4 → 768x1024。最终返回像素尺寸由提供方决定。

## 参考图与任务状态

请求支持可选的 `referenceImage: { fileName, dataUrl }`，其中 `dataUrl` 为完整的 base64 图片数据 URL，不接受本地路径、blob URL 或远程 URL。支持 PNG、JPEG、WebP，解码后最大 10 MiB；后端检查 MIME、base64 和文件头，非法输入返回 400。

- 不提供参考图时调用包装脚本的 `generate`；提供时调用 `edit --image`。
- 参考图暂存于独立临时目录，请求结束、失败或取消后清理；不使用上传文件名构造磁盘路径。
- 每次请求使用唯一输出名称，输出仍保存在配置的图片目录，避免并发请求串图。前端默认每次生成 1 张。
- 接口等待脚本完成后一次性返回，不提供实时百分比。前端在响应前保持等待状态，取消会中止 fetch，后端终止关联进程树。取消不能保证外部模型服务已经停止计费。
- 服务端启动时必须继承可用凭据。不要把 API Key 放在前端、请求 JSON、Git 文件或日志中。

验证参考图链路时，可以用 `ImageGen:ScriptPath` 覆盖为本地测试桩，核对 edit 参数、临时输入和输出；这不等同于验证真实模型的参考图效果。

如果本机 Python 或脚本路径不同，修改 `src/Nova.Api/appsettings.json` 中的 `ImageGen` 配置即可。后续接入 OpenAI、ComfyUI、Azure 或 MAF 时，只需新增 `IImageGenerationService` 实现并替换 DI 注册。
