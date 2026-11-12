using Nova.Application;
using Nova.Domain;
using Nova.Infrastructure;

const string SupportedProvider = "local-gpt-image";
const string SupportedModel = "gpt-image-2";
const int DefaultCount = 1;
const int MinCount = 1;
const int MaxCount = 8;
const int MaxPromptLength = 12000;
const int MaxStyleLength = 200;

var supportedRatios = new Dictionary<string, string>(StringComparer.Ordinal)
{
    ["1:1"] = "1024x1024",
    ["16:9"] = "1536x864",
    ["9:16"] = "864x1536",
    ["4:3"] = "1024x768",
    ["3:4"] = "768x1024",
};

var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<LocalImageGenOptions>(builder.Configuration.GetSection("ImageGen"));
builder.Services.AddSingleton<IImageGenerationService, LocalImageGenerationService>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .AllowAnyHeader()
    .AllowAnyMethod()
    .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")));

var app = builder.Build();
app.UseCors();
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "nova-api" }));
app.MapGet("/api/images/capabilities", () => Results.Ok(new
{
    providers = new[] { SupportedProvider },
    models = new[] { SupportedModel },
    ratios = supportedRatios.Keys.ToArray(),
    count = new { min = MinCount, max = MaxCount },
}));
app.MapPost("/api/images/generations", async (ImageGenerationHttpRequest? request, IImageGenerationService service, CancellationToken cancellationToken) =>
{
    if (request is null || string.IsNullOrWhiteSpace(request.Prompt))
        return Results.BadRequest(new { error = "提示词不能为空。" });

    var prompt = request.Prompt.Trim();
    if (prompt.Length > MaxPromptLength)
        return Results.BadRequest(new { error = $"提示词不能超过 {MaxPromptLength} 个字符。" });

    var model = string.IsNullOrWhiteSpace(request.Model) ? SupportedModel : request.Model.Trim();
    if (!string.Equals(model, SupportedModel, StringComparison.Ordinal))
        return Results.BadRequest(new { error = $"当前仅支持模型 {SupportedModel}。" });

    var provider = string.IsNullOrWhiteSpace(request.Provider) ? SupportedProvider : request.Provider.Trim();
    if (!string.Equals(provider, SupportedProvider, StringComparison.Ordinal))
        return Results.BadRequest(new { error = $"当前仅支持提供方 {SupportedProvider}。" });

    var ratio = string.IsNullOrWhiteSpace(request.Ratio) ? "1:1" : request.Ratio.Trim();
    if (!supportedRatios.ContainsKey(ratio))
        return Results.BadRequest(new { error = "不支持此画面比例。" });

    var count = request.Count ?? DefaultCount;
    if (count < MinCount || count > MaxCount)
        return Results.BadRequest(new { error = $"生成数量必须在 {MinCount} 到 {MaxCount} 之间。" });

    var style = request.Style?.Trim();
    if (style?.Length > MaxStyleLength)
        return Results.BadRequest(new { error = $"风格描述不能超过 {MaxStyleLength} 个字符。" });

    ReferenceImage? referenceImage = null;
    if (request.ReferenceImage is not null)
    {
        referenceImage = new ReferenceImage(
            request.ReferenceImage.DataUrl ?? string.Empty,
            request.ReferenceImage.FileName ?? string.Empty);
        if (!ReferenceImageValidator.TryDecode(referenceImage, out _))
            return Results.BadRequest(new { error = "参考图必须是有效的 PNG、JPEG 或 WebP 图片，且不能超过 10 MB。" });
    }

    var command = new GenerateImageCommand(
        prompt,
        model,
        provider,
        ratio,
        count,
        style,
        referenceImage);
    try
    {
        return Results.Ok(await service.GenerateAsync(command, cancellationToken));
    }
    catch (Exception exception) when (exception is InvalidOperationException or TimeoutException)
    {
        return Results.Problem(exception.Message, statusCode: StatusCodes.Status502BadGateway);
    }
}).WithName("GenerateImages");

app.Run();

public sealed record ImageGenerationHttpRequest(
    string Prompt,
    string? Model,
    string? Provider,
    string? Ratio,
    int? Count = null,
    string? Style = null,
    ReferenceImageHttpRequest? ReferenceImage = null);

public sealed record ReferenceImageHttpRequest(string? DataUrl, string? FileName);
