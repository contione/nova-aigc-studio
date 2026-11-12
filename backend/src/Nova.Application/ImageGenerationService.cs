using Nova.Domain;

namespace Nova.Application;

public sealed record GenerateImageCommand(
    string Prompt,
    string Model,
    string Provider,
    string Ratio,
    int Count,
    string? Style,
    ReferenceImage? ReferenceImage = null);

public interface IImageGenerationService
{
    Task<ImageGenerationResponse> GenerateAsync(GenerateImageCommand command, CancellationToken cancellationToken);
}
