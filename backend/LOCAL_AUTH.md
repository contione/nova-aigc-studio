# 本地图片生成凭据

后端调用本机 custom_imagegen.py；此包装脚本读取进程环境变量 OPENAI_API_KEY，或 CODEX_HOME 下 auth.json 中的 OPENAI_API_KEY。没有设置 CODEX_HOME 时使用当前用户的 .codex 目录。脚本不会自动使用桌面客户端的其他凭据存储。

如果缺少凭据，先停止原后端，在 PowerShell 7 中从仓库根目录运行：

```powershell
$env:OPENAI_API_KEY = Read-Host "输入当前自定义 Provider 的 API Key（不回显）" -MaskInput
try {
    rtk dotnet run --project backend/src/Nova.Api --urls http://localhost:5070
} finally {
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
}
```

密钥只进入该 PowerShell 及其子进程的环境，不写入仓库或命令历史。不要把密钥发到聊天中，也不要放进前端 VITE_ 变量、appsettings.json 或提交到 Git。包装脚本默认从本机 Codex 配置读取 Provider 地址，密钥必须与该 Provider 匹配。

健康检查及 --dry-run 不验证凭据是否有效，也不会生成图片。需要一次真实生成才能确认完整链路。
