using System.ComponentModel;
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
    private static readonly IReadOnlyDictionary<string, string> RatioToSize = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["1:1"] = "1024x1024",
        ["16:9"] = "1536x864",
        ["9:16"] = "864x1536",
        ["4:3"] = "1024x768",
        ["3:4"] = "768x1024",
    };

    private readonly LocalImageGenOptions settings = options.Value;

    public async Task<ImageGenerationResponse> GenerateAsync(GenerateImageCommand command, CancellationToken cancellationToken)
    {
        if (!string.Equals(command.Provider, "local-gpt-image", StringComparison.Ordinal)
            || !string.Equals(command.Model, "gpt-image-2", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("The requested image provider or model is not supported.");
        }

        if (!RatioToSize.TryGetValue(command.Ratio, out var size))
            throw new InvalidOperationException("The requested image ratio is not supported.");

        if (command.Count is < 1 or > 8)
            throw new InvalidOperationException("Image count must be between 1 and 8.");

        if (!File.Exists(settings.ScriptPath))
        {
            logger.LogError("Local image generation script was not found: {ScriptPath}", settings.ScriptPath);
            throw new InvalidOperationException("The local image generation service is unavailable.");
        }

        Directory.CreateDirectory(settings.OutputDirectory);
        var count = command.Count;
        var outputPath = Path.Combine(settings.OutputDirectory, $"nova-{Guid.NewGuid():N}.png");
        var outputFiles = BuildOutputPaths(outputPath, count);
        string? referenceDirectory = null;
        var completed = false;

        try
        {
            string? referencePath = null;
            if (command.ReferenceImage is not null)
            {
                if (!ReferenceImageValidator.TryDecode(command.ReferenceImage, out var referenceContent)
                    || referenceContent is null)
                {
                    throw new InvalidOperationException("referenceImage is invalid.");
                }

                referenceDirectory = Directory.CreateTempSubdirectory("nova-reference-").FullName;
                referencePath = Path.Combine(referenceDirectory, $"reference{referenceContent.Extension}");
                await File.WriteAllBytesAsync(referencePath, referenceContent.Bytes, cancellationToken);
            }

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
            processStartInfo.ArgumentList.Add(referencePath is null ? "generate" : "edit");
            if (referencePath is not null)
            {
                processStartInfo.ArgumentList.Add("--image");
                processStartInfo.ArgumentList.Add(referencePath);
            }
            processStartInfo.ArgumentList.Add("--prompt");
            processStartInfo.ArgumentList.Add(BuildPrompt(command));
            processStartInfo.ArgumentList.Add("--model");
            processStartInfo.ArgumentList.Add(command.Model);
            processStartInfo.ArgumentList.Add("--size");
            processStartInfo.ArgumentList.Add(size);
            processStartInfo.ArgumentList.Add("--n");
            processStartInfo.ArgumentList.Add(count.ToString());
            processStartInfo.ArgumentList.Add("--output-format");
            processStartInfo.ArgumentList.Add("png");
            processStartInfo.ArgumentList.Add("--out");
            processStartInfo.ArgumentList.Add(outputPath);

            var processResult = await RunProcessAsync(processStartInfo, cancellationToken);
            if (processResult.ExitCode != 0)
            {
                var processOutput = $"{processResult.Stderr}\n{processResult.Stdout}";
                if (IsCredentialConfigurationError(processOutput))
                    throw new InvalidOperationException("图片生成服务端缺少 OPENAI_API_KEY 或 Codex 凭据，请配置后重试。");

                throw new InvalidOperationException($"图片生成进程失败，退出码：{processResult.ExitCode}。");
            }

            var images = new List<GeneratedImage>(outputFiles.Length);
            foreach (var file in outputFiles)
            {
                if (!File.Exists(file) || !IsImage(file))
                {
                    logger.LogWarning("Image generation completed without all expected output files.");
                    throw new InvalidOperationException("图片生成进程未返回预期的图片，请重试。");
                }

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

            completed = true;
            return new ImageGenerationResponse(Guid.NewGuid().ToString("N"), images);
        }
        finally
        {
            if (!completed)
                DeleteFiles(outputFiles);
            DeleteDirectory(referenceDirectory);
        }
    }

    private async Task<ProcessResult> RunProcessAsync(ProcessStartInfo processStartInfo, CancellationToken cancellationToken)
    {
        using var process = new Process { StartInfo = processStartInfo };
        try
        {
            if (!process.Start())
                throw new InvalidOperationException("The local image generation service is unavailable.");
        }
        catch (Exception exception) when (exception is Win32Exception or InvalidOperationException)
        {
            logger.LogError(exception, "Unable to start the local image generation process.");
            throw new InvalidOperationException("The local image generation service is unavailable. Check its configuration and try again.");
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        try
        {
            await process.WaitForExitAsync(timeout.Token);
            var output = await Task.WhenAll(stdoutTask, stderrTask).WaitAsync(timeout.Token);
            cancellationToken.ThrowIfCancellationRequested();
            return new ProcessResult(process.ExitCode, output[0], output[1]);
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested)
        {
            await KillProcessTreeAsync(process);
            await DrainOutputAsync(stdoutTask, stderrTask);
            if (cancellationToken.IsCancellationRequested)
                throw new OperationCanceledException(cancellationToken);
            throw new TimeoutException("图片生成超时，请稍后重试。");
        }
    }

    private static async Task KillProcessTreeAsync(Process process)
    {
        try
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException)
        {
        }

        try
        {
            await process.WaitForExitAsync();
        }
        catch (InvalidOperationException)
        {
        }
    }

    private static async Task DrainOutputAsync(Task<string> stdoutTask, Task<string> stderrTask)
    {
        try
        {
            await Task.WhenAll(stdoutTask, stderrTask);
        }
        catch
        {
        }
    }

    private static string[] BuildOutputPaths(string outputPath, int count)
    {
        if (count == 1)
            return [outputPath];
        var directory = Path.GetDirectoryName(outputPath) ?? string.Empty;
        var stem = Path.GetFileNameWithoutExtension(outputPath);
        var extension = Path.GetExtension(outputPath);
        return Enumerable.Range(1, count)
            .Select(index => Path.Combine(directory, $"{stem}-{index}{extension}"))
            .ToArray();
    }

    private static void DeleteFiles(IEnumerable<string> paths)
    {
        foreach (var path in paths)
        {
            try
            {
                File.Delete(path);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }
    }

    private static void DeleteDirectory(string? path)
    {
        if (path is null)
            return;

        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    private static string BuildPrompt(GenerateImageCommand command)
    {
        var style = string.IsNullOrWhiteSpace(command.Style) ? string.Empty : $"\uFF0C\u98CE\u683C\uFF1A{command.Style}";
        return $"{command.Prompt}{style}\uFF0C\u753B\u9762\u6BD4\u4F8B\uFF1A{command.Ratio}";
    }

    private static bool IsCredentialConfigurationError(string processOutput)
    {
        var normalizedOutput = processOutput.ToLowerInvariant();
        return normalizedOutput.Contains("openai_api_key", StringComparison.Ordinal)
            || normalizedOutput.Contains("openai api key", StringComparison.Ordinal)
            || normalizedOutput.Contains("codex", StringComparison.Ordinal)
                && (normalizedOutput.Contains("credential", StringComparison.Ordinal)
                    || normalizedOutput.Contains("login", StringComparison.Ordinal)
                    || normalizedOutput.Contains("auth", StringComparison.Ordinal));
    }

    private static bool IsImage(string path) => Path.GetExtension(path).ToLowerInvariant() is ".png" or ".jpg" or ".jpeg" or ".webp";

    private sealed record ProcessResult(int ExitCode, string Stdout, string Stderr);
}
