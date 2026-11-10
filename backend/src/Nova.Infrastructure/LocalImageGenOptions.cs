namespace Nova.Infrastructure;

public sealed class LocalImageGenOptions
{
    public string PythonExecutable { get; set; } = "python";
    public string ScriptPath { get; set; } = "C:\\Users\\82742\\.agents\\scripts\\custom_imagegen.py";
    public string OutputDirectory { get; set; } = "C:\\Users\\82742\\Pictures\\AI";
    public int TimeoutSeconds { get; set; } = 300;
}
