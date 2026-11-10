using Nova.Application;
using Nova.Infrastructure;

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
app.MapPost("/api/images/generations", async (ImageGenerationHttpRequest request, IImageGenerationService service, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Prompt))
        return Results.BadRequest(new { error = "prompt 不能为空" });

    var command = new GenerateImageCommand(
        request.Prompt.Trim(),
        string.IsNullOrWhiteSpace(request.Model) ? "gpt-image-2" : request.Model,
        string.IsNullOrWhiteSpace(request.Provider) ? "local-gpt-image" : request.Provider,
        string.IsNullOrWhiteSpace(request.Ratio) ? "1:1" : request.Ratio,
        Math.Clamp(request.Count <= 0 ? 1 : request.Count, 1, 8),
        request.Style);
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
    int Count = 1,
    string? Style = null);
