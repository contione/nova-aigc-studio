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

如果本机 Python 或脚本路径不同，修改 `src/Nova.Api/appsettings.json` 中的 `ImageGen` 配置即可。后续接入 OpenAI、ComfyUI、Azure 或 MAF 时，只需新增 `IImageGenerationService` 实现并替换 DI 注册。
