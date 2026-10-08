import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const script = `$ErrorActionPreference = 'Stop'

# --- Configuration ---
# Update this to your actual GitHub repository (e.g., "gourav/zahard")
$GithubRepo = "c2-07/zahard"

$InstallDir = Join-Path $env:LOCALAPPDATA 'za\\bin'
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

$ZaExePath = Join-Path $InstallDir 'za.exe'
$BinaryName = "za-windows-x86_64.exe"
$DownloadUrl = "https://github.com/$GithubRepo/releases/latest/download/$BinaryName"

Write-Output "Installing 'za' CLI from $GithubRepo..."
Write-Output "Downloading $BinaryName..."

try {
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZaExePath -UseBasicParsing
} catch {
  Write-Error "Failed to download the binary. Make sure you have published a release with the asset '$BinaryName' to $GithubRepo"
  exit 1
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) {
  $userPath = ''
}

if ($userPath -notlike "*$InstallDir*") {
  $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $InstallDir } else { "$userPath;$InstallDir" }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Write-Output "Added $InstallDir to your user PATH."
}

$env:Path = "$InstallDir;$env:Path"

Write-Output '----------------------------------------'
Write-Output "Successfully installed 'za' CLI for Windows!"
Write-Output '----------------------------------------'
Write-Output 'If this is a new terminal, restart it before running za.'
Write-Output ''
Write-Output 'Getting started:'
Write-Output '  1. Login:   za login'
Write-Output '  2. Ask:     za "Hello world!"'
Write-Output '  3. Help:    za help'
`;

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain'
    }
  });
};
