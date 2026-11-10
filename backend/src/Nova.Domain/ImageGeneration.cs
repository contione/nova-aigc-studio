namespace Nova.Domain;

public sealed record ImageGenerationRequest(
    string Prompt,
    string? Model,
    string? Provider,
    string? Ratio,
    int Count,
    string? Style);

public sealed record GeneratedImage(
    string DataUrl,
    string FileName,
    string Provider,
    string Model);

public sealed record ImageGenerationResponse(
    string RequestId,
    IReadOnlyList<GeneratedImage> Images);
