namespace Nova.Domain;

public sealed record ReferenceImage(string DataUrl, string FileName);

public sealed record ReferenceImageContent(byte[] Bytes, string MediaType, string Extension);

public static class ReferenceImageValidator
{
    public const int MaxBytes = 10 * 1024 * 1024;
    private const int MaxBase64Characters = ((MaxBytes + 2) / 3) * 4;

    public static bool TryDecode(ReferenceImage? referenceImage, out ReferenceImageContent? content)
    {
        content = null;
        if (referenceImage is null
            || string.IsNullOrWhiteSpace(referenceImage.DataUrl)
            || string.IsNullOrWhiteSpace(referenceImage.FileName))
        {
            return false;
        }

        var dataUrl = referenceImage.DataUrl.Trim();
        var separator = dataUrl.IndexOf(',');
        if (separator <= "data:".Length || separator == dataUrl.Length - 1)
            return false;

        var metadata = dataUrl[..separator];
        if (!metadata.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
            || !metadata.EndsWith(";base64", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var mediaType = metadata["data:".Length..^";base64".Length].ToLowerInvariant();
        if (mediaType is not "image/png" and not "image/jpeg" and not "image/webp")
            return false;

        var encoded = dataUrl[(separator + 1)..];
        if (encoded.Length == 0
            || encoded.Length > MaxBase64Characters
            || encoded.Length % 4 != 0
            || encoded.Any(char.IsWhiteSpace))
        {
            return false;
        }

        var bytes = new byte[(encoded.Length / 4) * 3];
        if (!Convert.TryFromBase64String(encoded, bytes, out var bytesWritten)
            || bytesWritten == 0
            || bytesWritten > MaxBytes)
        {
            return false;
        }

        var decoded = bytes.AsSpan(0, bytesWritten);
        var extension = mediaType switch
        {
            "image/png" when IsPng(decoded) => ".png",
            "image/jpeg" when IsJpeg(decoded) => ".jpg",
            "image/webp" when IsWebp(decoded) => ".webp",
            _ => string.Empty,
        };
        if (extension.Length == 0)
            return false;

        if (bytesWritten != bytes.Length)
            Array.Resize(ref bytes, bytesWritten);
        content = new ReferenceImageContent(bytes, mediaType, extension);
        return true;
    }

    private static bool IsPng(ReadOnlySpan<byte> bytes) =>
        bytes.Length >= 8
        && bytes[0] == 0x89
        && bytes[1] == 0x50
        && bytes[2] == 0x4E
        && bytes[3] == 0x47
        && bytes[4] == 0x0D
        && bytes[5] == 0x0A
        && bytes[6] == 0x1A
        && bytes[7] == 0x0A;

    private static bool IsJpeg(ReadOnlySpan<byte> bytes) =>
        bytes.Length >= 3
        && bytes[0] == 0xFF
        && bytes[1] == 0xD8
        && bytes[2] == 0xFF;

    private static bool IsWebp(ReadOnlySpan<byte> bytes) =>
        bytes.Length >= 12
        && bytes[0] == (byte)'R'
        && bytes[1] == (byte)'I'
        && bytes[2] == (byte)'F'
        && bytes[3] == (byte)'F'
        && bytes[8] == (byte)'W'
        && bytes[9] == (byte)'E'
        && bytes[10] == (byte)'B'
        && bytes[11] == (byte)'P';
}

public sealed record ImageGenerationRequest(
    string Prompt,
    string? Model,
    string? Provider,
    string? Ratio,
    int Count,
    string? Style,
    ReferenceImage? ReferenceImage = null);

public sealed record GeneratedImage(
    string DataUrl,
    string FileName,
    string Provider,
    string Model);

public sealed record ImageGenerationResponse(
    string RequestId,
    IReadOnlyList<GeneratedImage> Images);
