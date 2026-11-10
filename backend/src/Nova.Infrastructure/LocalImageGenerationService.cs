using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nova.Application;
using Nova.Domain;

namespace Nova.Infrastructure;

public sealed class LocalImageGenerationService(
    IOptions<LocalImageGenOptions> options,
    ILogger<LocalImageGenerationService> logger) : IImageGenerationService
{
    private readonly LocalImageGenOptions settings = options.Value;

    public async Task<ImageGenerationResponse> GenerateAsync(GenerateImageCommand command, CancellationToken cancellationToken)
    {
        if (!File.Exists(settings.ScriptPath))
            throw new InvalidOperationException($"本地图片生成脚本不存在：{settings.ScriptPath}");

        Directory.CreateDirectory(settings.OutputDirectory);
        var startedAt = DateTime.UtcNow.AddSeconds(-1);
        var processStartInfo = new ProcessStartInfo
        {
            FileName = settings.PythonExecutable,
            WorkingDirectory = settings.OutputDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        processStartInfo.ArgumentList.Add(settings.ScriptPath);
        processStartInfo.ArgumentList.Add("generate");
        processStartInfo.ArgumentList.Add("--prompt");
        processStartInfo.ArgumentList.Add(BuildPrompt(command));
        processStartInfo.ArgumentList.Add("--model");
        processStartInfo.ArgumentList.Add(command.Model);
        processStartInfo.ArgumentList.Add("--n");
        processStartInfo.ArgumentList.Add(Math.Clamp(command.Count, 1, 8).ToString());

        using var process = new Process { StartInfo = processStartInfo };
        if (!process.Start()) throw new InvalidOperationException("无法启动本地图片生成进程。");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));
        var stdoutTask = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var stderrTask = process.StandardError.ReadToEndAsync(timeout.Token);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (process.ExitCode != 0)
                throw new InvalidOperationException($"图片生成进程失败：{stderr.Trim()} {stdout.Trim()}".Trim());
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            try { process.Kill(true); } catch { }
            throw new TimeoutException("图片生成超时，请稍后重试。");
        }

        var files = Directory.GetFiles(settings.OutputDirectory)
            .Where(path => IsImage(path) && File.GetLastWriteTimeUtc(path) >= startedAt)
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .Take(Math.Clamp(command.Count, 1, 8))
            .ToArray();
        if (files.Length == 0)
        {
            logger.LogWarning("图片生成进程成功但没有找到输出文件，目录：{Directory}", settings.OutputDirectory);
            throw new InvalidOperationException("图片生成完成，但没有找到输出图片。");
        }

        var images = new List<GeneratedImage>(files.Length);
        foreach (var file in files)
        {
            var bytes = await File.ReadAllBytesAsync(file, cancellationToken);
            var mediaType = Path.GetExtension(file).ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".webp" => "image/webp",
                _ => "image/png",
            };
            images.Add(new GeneratedImage(
                $"data:{mediaType};base64,{Convert.ToBase64String(bytes)}",
                Path.GetFileName(file),
                command.Provider,
                command.Model));
        }

        return new ImageGenerationResponse(Guid.NewGuid().ToString("N"), images);
    }

    private static string BuildPrompt(GenerateImageCommand command)
    {
        var style = string.IsNullOrWhiteSpace(command.Style) ? string.Empty : $"，风格：{command.Style}";
        return $"{command.Prompt}{style}，画面比例：{command.Ratio}";
    }

    private static bool IsImage(string path) => Path.GetExtension(path).ToLowerInvariant() is ".png" or ".jpg" or ".jpeg" or ".webp";
}
