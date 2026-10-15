import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const userAgent = request.headers.get('user-agent') || '';
  const isWindows = userAgent.toLowerCase().includes('windows') || userAgent.toLowerCase().includes('powershell');

  if (isWindows) {
    const psScript = `$ErrorActionPreference = 'Stop'

# --- Configuration ---
# Update this to your actual GitHub repository (e.g., "gourav/zahard")
$GithubRepo = "c2-07/zahard"

$InstallDir = Join-Path $env:LOCALAPPDATA 'za\\bin'
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

$ZaExePath = Join-Path $InstallDir 'za.exe'

# Detect Architecture
$rawArch = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) {
  $rawArch = $env:PROCESSOR_ARCHITEW6432
}

switch -Regex ($rawArch) {
  'ARM64' { $ArchName = 'aarch64' }
  'AMD64' { $ArchName = 'x86_64' }
  default {
    Write-Error "Unsupported architecture: $rawArch"
    exit 1
  }
}

$BinaryName = "za-windows-$ArchName.exe"
$DownloadUrl = "https://github.com/$GithubRepo/releases/latest/download/$BinaryName"

Write-Output "Installing 'za' CLI from $GithubRepo..."
Write-Output "Detected architecture: $rawArch ($ArchName)"
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
  Write-Output "Added $InstallDir to your User PATH in Registry."
}

# Add directly into PowerShell Profiles so every new PS session has za in PATH
$docs = [Environment]::GetFolderPath('MyDocuments')
$profileList = @(
  $PROFILE,
  (Join-Path $docs 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1'),
  (Join-Path $docs 'PowerShell\Microsoft.PowerShell_profile.ps1')
) | Select-Object -Unique

foreach ($p in $profileList) {
  if ($p) {
    try {
      $pDir = Split-Path -Parent $p
      if (-not (Test-Path $pDir)) {
        New-Item -ItemType Directory -Path $pDir -Force | Out-Null
      }
      $line1 = 'if ($env:Path -notlike "*' + $InstallDir + '*") { $env:Path = "' + $InstallDir + ';$env:Path" }'
      $line2 = '$PSDefaultParameterValues[''Out-File:Encoding''] = ''utf8'''
      if (-not (Test-Path $p)) {
        Set-Content -Path $p -Value ($line1 + [Environment]::NewLine + $line2) -Encoding utf8
        Write-Output "Configured PowerShell profile: $p"
      } else {
        $pContent = Get-Content -Path $p -Raw
        if ($pContent -notlike "*$InstallDir*") {
          Add-Content -Path $p -Value ([Environment]::NewLine + $line1) -Encoding utf8
        }
        if ($pContent -notlike "*Out-File:Encoding*") {
          Add-Content -Path $p -Value ([Environment]::NewLine + $line2) -Encoding utf8
        }
      }
    } catch {}
  }
}

# Auto-refresh active session PATH immediately
$env:Path = "$InstallDir;$env:Path"

# Remove any legacy user identity file if present for privacy
$legacyUserFile = Join-Path $env:APPDATA 'za\\user'
if (Test-Path $legacyUserFile) { Remove-Item -Force $legacyUserFile }
$legacyConfigUser = Join-Path $HOME '.config\\za\\user'
if (Test-Path $legacyConfigUser) { Remove-Item -Force $legacyConfigUser }

$ESC = [char]27
$BLUE = "$ESC[1;34m"
$RESET = "$ESC[0m"

Write-Output '----------------------------------------'
Write-Output "  Successfully installed 'za' CLI!"
Write-Output '----------------------------------------'
Write-Output ''
Write-Output 'Quick Start:'
Write-Output '  za login                Log in to your account'
Write-Output '  za "your question"      Ask anything / generate code'
Write-Output '  za -o file.c prompt     Save clean code to file (No null errors!)'
Write-Output '  za -t "hard problem"    Prioritize reasoning model'
Write-Output '  za help                 Show all commands'
Write-Output ''
Write-Output "Run this now to enable 'za' in this terminal:"
Write-Output "  $BLUE. \$PROFILE$RESET  (or restart PowerShell)"
Write-Output ''
`;
    return new Response(psScript, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  const shScript = `#!/bin/sh
set -e

# --- Configuration ---
# Update this to your actual GitHub repository (e.g., "gourav/zahard")
GITHUB_REPO="c2-07/zahard"
INSTALL_DIR="$HOME/.local/bin"

echo "Installing 'za' CLI from $GITHUB_REPO..."

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Linux*)     OS_NAME="linux"; EXT="";;
    Darwin*)    OS_NAME="macos"; EXT="";;
    CYGWIN*|MINGW*|MSYS*) OS_NAME="windows"; EXT=".exe";;
    *)          echo "Unsupported OS: $OS" >&2; exit 1;;
esac

# Detect Architecture
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64|amd64) ARCH_NAME="x86_64";;
    aarch64|arm64) ARCH_NAME="aarch64";;
    *)            echo "Unsupported architecture: $ARCH" >&2; exit 1;;
esac

BINARY_NAME="za-\${OS_NAME}-\${ARCH_NAME}\${EXT}"
DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/latest/download/$BINARY_NAME"
TARGET_BIN="$INSTALL_DIR/za\${EXT}"

mkdir -p "$INSTALL_DIR"

echo "Downloading $BINARY_NAME..."
if ! curl -fsSL -o "$TARGET_BIN" "$DOWNLOAD_URL"; then
    echo "Error: Failed to download the binary." >&2
    echo "Make sure you have published a release with the asset '$BINARY_NAME' to $GITHUB_REPO" >&2
    exit 1
fi

chmod +x "$TARGET_BIN"

# --- PATH Configuration ---
add_to_path() {
    file="$1"
    line_to_add="$2"
    [ -f "$file" ] || touch "$file"
    if ! grep -q "$INSTALL_DIR" "$file"; then
        printf '\\n%s\\n' "$line_to_add" >> "$file"
        echo "  Added $INSTALL_DIR to PATH in $file"
    fi
}

SHELL_NAME="\${SHELL##*/}"
DETECTED=0

case "$SHELL_NAME" in
    zsh)
        add_to_path "$HOME/.zshrc" 'export PATH="$HOME/.local/bin:$PATH"'
        DETECTED=1
        ;;
    bash)
        add_to_path "$HOME/.bashrc" 'export PATH="$HOME/.local/bin:$PATH"'
        case "$(uname -s)" in
            Darwin*)
                add_to_path "$HOME/.bash_profile" 'export PATH="$HOME/.local/bin:$PATH"'
                ;;
        esac
        DETECTED=1
        ;;
    fish)
        mkdir -p "$HOME/.config/fish"
        add_to_path "$HOME/.config/fish/config.fish" 'fish_add_path "$HOME/.local/bin"'
        DETECTED=1
        ;;
    ksh|mksh)
        add_to_path "$HOME/.kshrc" 'export PATH="$HOME/.local/bin:$PATH"'
        add_to_path "$HOME/.profile" 'export PATH="$HOME/.local/bin:$PATH"'
        DETECTED=1
        ;;
    csh|tcsh)
        add_to_path "$HOME/.cshrc" 'setenv PATH "$HOME/.local/bin:$PATH"'
        DETECTED=1
        ;;
    nu|nushell)
        mkdir -p "$HOME/.config/nushell"
        add_to_path "$HOME/.config/nushell/env.nu" '\$env.PATH = (\$env.PATH | prepend \\$"(\$env.HOME)/.local/bin")'
        DETECTED=1
        ;;
esac

if [ -f "$HOME/.profile" ] || [ "$DETECTED" = "0" ]; then
    add_to_path "$HOME/.profile" 'export PATH="$HOME/.local/bin:$PATH"'
fi

if [ "$DETECTED" = "0" ]; then
    echo ""
    echo "  Note: Unrecognized shell ($SHELL_NAME)."
    echo "  We added $INSTALL_DIR to ~/.profile which works for most POSIX login shells."
    echo "  If your shell doesn't read ~/.profile, please add $INSTALL_DIR to your PATH manually."
fi

export PATH="$INSTALL_DIR:$PATH"

# Remove legacy user identity file if present for privacy
rm -f "$HOME/.config/za/user" 2>/dev/null || true

# Determine source command for detected shell (NEVER use . notation)
case "$SHELL_NAME" in
    zsh)
        RELOAD_CMD="source ~/.zshrc"
        ;;
    bash)
        RELOAD_CMD="source ~/.bashrc"
        ;;
    fish)
        RELOAD_CMD="source ~/.config/fish/config.fish"
        ;;
    ksh|mksh)
        RELOAD_CMD="source ~/.kshrc"
        ;;
    csh|tcsh)
        RELOAD_CMD="source ~/.cshrc"
        ;;
    nu|nushell)
        RELOAD_CMD="source ~/.config/nushell/env.nu"
        ;;
    *)
        RELOAD_CMD="source ~/.profile"
        ;;
esac

BLUE='\\033[1;34m'
RESET='\\033[0m'

echo ""
echo "----------------------------------------"
echo "  Successfully installed 'za' CLI!"
echo "----------------------------------------"
echo ""
echo "Quick Start:"
echo "  za login                Log in to your account"
echo "  za \"your question\"      Ask anything / generate code"
echo "  za -o file.c prompt     Save clean code to file (No null errors!)"
echo "  za -t \"hard problem\"    Prioritize reasoning model"
echo "  za help                 Show all commands"
echo ""
echo "Run this now to enable 'za' in this terminal:"
printf "  %b%s%b\\n" "\$BLUE" "\$RELOAD_CMD" "\$RESET"
echo ""
`;

  return new Response(shScript, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
};
