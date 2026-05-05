$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$releaseDir = Join-Path $root "release"
$appDir = Join-Path $releaseDir "win-unpacked"
$version = "0.1.0"
$payloadName = "Space_-$version-win-x64.zip"
$payloadPath = Join-Path $releaseDir $payloadName
$setupPath = Join-Path $releaseDir "Space_-Setup-$version.exe"
$licensePath = Join-Path $root "installer\LICENSE.txt"
$iconPath = Join-Path $root "assets\app-256.ico"

if (-not (Test-Path -LiteralPath $appDir)) {
  throw "Packaged app folder not found: $appDir"
}

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
Remove-Item -LiteralPath $payloadPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $setupPath -Force -ErrorAction SilentlyContinue

Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $payloadPath -Force

$source = @"
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class SpaceInstaller
{
    private const string AppName = "Space_";
    private const string Version = "0.1.0";
    private const string PayloadName = "Space_-0.1.0-win-x64.zip";
    private const string IconName = "app-256.ico";
    private const string LicenseName = "LICENSE.txt";

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string licenseText = ReadResourceText(LicenseName);
        if (!ShowLicense(licenseText))
        {
            return;
        }

        try
        {
            Install();
            MessageBox.Show("Space_ was installed successfully. Desktop and Start Menu shortcuts were created.", "Space_ Installer", MessageBoxButtons.OK, MessageBoxIcon.Information);
            string exePath = Path.Combine(GetInstallDir(), "Space_.exe");
            Process.Start(new ProcessStartInfo(exePath) { WorkingDirectory = GetInstallDir(), UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Space_ Installer", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static bool ShowLicense(string licenseText)
    {
        using (Form form = new Form())
        using (TextBox box = new TextBox())
        using (Button agree = new Button())
        using (Button cancel = new Button())
        {
            form.Text = "Space_ License Agreement";
            form.StartPosition = FormStartPosition.CenterScreen;
            form.Size = new Size(760, 560);
            form.MinimizeBox = false;
            form.MaximizeBox = false;
            form.Icon = LoadInstallerIcon();

            box.Multiline = true;
            box.ReadOnly = true;
            box.ScrollBars = ScrollBars.Vertical;
            box.Text = licenseText;
            box.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            box.Location = new Point(16, 16);
            box.Size = new Size(710, 430);
            box.Font = new Font("Segoe UI", 10f);

            agree.Text = "I Agree";
            agree.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            agree.Location = new Point(526, 466);
            agree.Size = new Size(96, 34);
            agree.DialogResult = DialogResult.OK;

            cancel.Text = "Cancel";
            cancel.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            cancel.Location = new Point(630, 466);
            cancel.Size = new Size(96, 34);
            cancel.DialogResult = DialogResult.Cancel;

            form.Controls.Add(box);
            form.Controls.Add(agree);
            form.Controls.Add(cancel);
            form.AcceptButton = agree;
            form.CancelButton = cancel;

            return form.ShowDialog() == DialogResult.OK;
        }
    }

    private static void Install()
    {
        string installDir = GetInstallDir();
        string tempZip = Path.Combine(Path.GetTempPath(), PayloadName);

        foreach (Process process in Process.GetProcessesByName("Space_"))
        {
            try { process.Kill(); process.WaitForExit(4000); } catch { }
        }

        if (Directory.Exists(installDir))
        {
            Directory.Delete(installDir, true);
        }
        Directory.CreateDirectory(installDir);

        WriteResourceToFile(PayloadName, tempZip);
        ZipFile.ExtractToDirectory(tempZip, installDir);

        string iconPath = Path.Combine(installDir, "Space_.ico");
        WriteResourceToFile(IconName, iconPath);

        string exePath = Path.Combine(installDir, "Space_.exe");
        if (!File.Exists(exePath))
        {
            throw new FileNotFoundException("Space_.exe was not installed correctly.", exePath);
        }

        CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Space_.lnk"), exePath, installDir, iconPath);

        string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Space_");
        Directory.CreateDirectory(startMenuDir);
        CreateShortcut(Path.Combine(startMenuDir, "Space_.lnk"), exePath, installDir, iconPath);
    }

    private static string GetInstallDir()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Space_");
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory, string iconPath)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        dynamic shell = Activator.CreateInstance(shellType);
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = targetPath;
        shortcut.WorkingDirectory = workingDirectory;
        shortcut.IconLocation = iconPath;
        shortcut.Description = "Space_ Browser";
        shortcut.Save();
        Marshal.FinalReleaseComObject(shortcut);
        Marshal.FinalReleaseComObject(shell);
    }

    private static string ReadResourceText(string suffix)
    {
        Assembly assembly = Assembly.GetExecutingAssembly();
        string name = assembly.GetManifestResourceNames().FirstOrDefault(item => item.EndsWith(suffix, StringComparison.OrdinalIgnoreCase));
        if (name == null) return "";
        using (Stream stream = assembly.GetManifestResourceStream(name))
        using (StreamReader reader = new StreamReader(stream))
        {
            return reader.ReadToEnd();
        }
    }

    private static void WriteResourceToFile(string suffix, string path)
    {
        Assembly assembly = Assembly.GetExecutingAssembly();
        string name = assembly.GetManifestResourceNames().FirstOrDefault(item => item.EndsWith(suffix, StringComparison.OrdinalIgnoreCase));
        if (name == null) throw new FileNotFoundException("Missing installer resource: " + suffix);
        using (Stream input = assembly.GetManifestResourceStream(name))
        using (FileStream output = File.Create(path))
        {
            input.CopyTo(output);
        }
    }

    private static Icon LoadInstallerIcon()
    {
        try
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            string name = assembly.GetManifestResourceNames().FirstOrDefault(item => item.EndsWith(IconName, StringComparison.OrdinalIgnoreCase));
            if (name == null) return null;
            using (Stream stream = assembly.GetManifestResourceStream(name))
            {
                return new Icon(stream);
            }
        }
        catch
        {
            return null;
        }
    }
}
"@

$compilerParams = New-Object System.CodeDom.Compiler.CompilerParameters
$compilerParams.GenerateExecutable = $true
$compilerParams.OutputAssembly = $setupPath
$compilerParams.CompilerOptions = "/target:winexe /platform:x64 /optimize+ /win32icon:`"$iconPath`""
$compilerParams.ReferencedAssemblies.Add("System.dll") | Out-Null
$compilerParams.ReferencedAssemblies.Add("System.Core.dll") | Out-Null
$compilerParams.ReferencedAssemblies.Add("System.Drawing.dll") | Out-Null
$compilerParams.ReferencedAssemblies.Add("System.Windows.Forms.dll") | Out-Null
$compilerParams.ReferencedAssemblies.Add("System.IO.Compression.dll") | Out-Null
$compilerParams.ReferencedAssemblies.Add("System.IO.Compression.FileSystem.dll") | Out-Null
$compilerParams.ReferencedAssemblies.Add("Microsoft.CSharp.dll") | Out-Null
$compilerParams.EmbeddedResources.Add($payloadPath) | Out-Null
$compilerParams.EmbeddedResources.Add($licensePath) | Out-Null
$compilerParams.EmbeddedResources.Add($iconPath) | Out-Null

Add-Type -TypeDefinition $source -CompilerParameters $compilerParams

if (-not (Test-Path -LiteralPath $setupPath)) {
  throw "Installer was not created: $setupPath"
}

Write-Host "Created installer: $setupPath"
