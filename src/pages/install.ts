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

# Ensure HOME is resolved
if [ -z "$HOME" ]; then
    HOME="$(getent passwd "$(id -un 2>/dev/null || whoami)" 2>/dev/null | cut -d: -f6)"
fi
[ -z "$HOME" ] && HOME="$PWD"

INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR" 2>/dev/null || {
    echo "Error: Cannot create directory $INSTALL_DIR. Please check write permissions." >&2
    exit 1
}

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
    x86_64|amd64|x86-64|x64) ARCH_NAME="x86_64";;
    aarch64|arm64|armv8*)    ARCH_NAME="aarch64";;
    *)                       echo "Unsupported architecture: $ARCH" >&2; exit 1;;
esac

BINARY_NAME="za-\${OS_NAME}-\${ARCH_NAME}\${EXT}"
DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/latest/download/$BINARY_NAME"
TARGET_BIN="$INSTALL_DIR/za\${EXT}"
TMP_BIN="$INSTALL_DIR/.za.tmp.$$"

echo "Downloading $BINARY_NAME to $INSTALL_DIR/za..."

download_file() {
    url="$1"
    dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fL --retry 3 --connect-timeout 15 -o "$dest" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q --tries=3 --timeout=15 -O "$dest" "$url"
    else
        echo "Error: Neither curl nor wget was found on this system." >&2
        return 1
    fi
}

rm -f "$TMP_BIN"
if ! download_file "$DOWNLOAD_URL" "$TMP_BIN"; then
    rm -f "$TMP_BIN"
    echo "Error: Failed to download the binary from $DOWNLOAD_URL" >&2
    echo "Make sure release asset '$BINARY_NAME' exists in $GITHUB_REPO" >&2
    exit 1
fi

if [ ! -s "$TMP_BIN" ]; then
    rm -f "$TMP_BIN"
    echo "Error: Downloaded file is empty." >&2
    exit 1
fi

chmod +x "$TMP_BIN"
mv -f "$TMP_BIN" "$TARGET_BIN"
chmod +x "$TARGET_BIN"

if [ ! -f "$TARGET_BIN" ]; then
    echo "Error: Failed to place binary at $TARGET_BIN" >&2
    exit 1
fi

# --- Multi-Shell PATH Configuration (bash, sh, zsh, fish) ---
dir_in_path() {
    target="$1"
    path_val="$2"
    [ -n "$path_val" ] || return 1

    case ":\${path_val}:" in
        *":\${target}:"*|*":\${target}/:"*|*":\${HOME}/.local/bin:"*|*":\${HOME}/.local/bin/:"*|*":~/.local/bin:"*|*":~/.local/bin/:"*)
            return 0
            ;;
    esac
    case " \${path_val} " in
        *" \${target} "*|*" \${target}/ "*|*" \${HOME}/.local/bin "*|*" \${HOME}/.local/bin/ "*|*" ~/.local/bin "*)
            return 0
            ;;
    esac
    return 1
}

already_in_file() {
    file="$1"
    [ -f "$file" ] || return 1
    grep -E '(\\$HOME|~|/home/[^/]+|/Users/[^/]+)?/\\.local/bin' "$file" >/dev/null 2>&1
}

add_to_posix_file() {
    file="$1"
    [ -n "$file" ] || return 0
    dir="$(dirname "$file")"
    [ -d "$dir" ] || mkdir -p "$dir" 2>/dev/null || true

    if already_in_file "$file"; then
        return 0
    fi

    if [ -f "$file" ]; then
        [ -s "$file" ] && [ -n "$(tail -c1 "$file" 2>/dev/null)" ] && printf '\\n' >> "$file"
        printf '\\n# za CLI PATH\\nexport PATH="$HOME/.local/bin:$PATH"\\n' >> "$file"
        echo "  Appended PATH to existing $file"
    else
        printf '# za CLI PATH\\nexport PATH="$HOME/.local/bin:$PATH"\\n' > "$file"
        echo "  Created $file with PATH"
    fi
}

add_to_fish_file() {
    fish_file="$HOME/.config/fish/config.fish"
    dir="$(dirname "$fish_file")"
    [ -d "$dir" ] || mkdir -p "$dir" 2>/dev/null || true

    if already_in_file "$fish_file"; then
        return 0
    fi

    fish_line='fish_add_path "$HOME/.local/bin" 2>/dev/null || set -gx PATH "$HOME/.local/bin" $PATH'
    if [ -f "$fish_file" ]; then
        [ -s "$fish_file" ] && [ -n "$(tail -c1 "$fish_file" 2>/dev/null)" ] && printf '\\n' >> "$fish_file"
        printf '\\n# za CLI PATH\\n%s\\n' "$fish_line" >> "$fish_file"
        echo "  Appended PATH to existing $fish_file"
    else
        printf '# za CLI PATH\\n%s\\n' "$fish_line" > "$fish_file"
        echo "  Created $fish_file with PATH"
    fi
}

DEF_SHELL="\${SHELL:-}"
if [ -z "$DEF_SHELL" ]; then
    DEF_SHELL="$(getent passwd "$(id -un 2>/dev/null || whoami)" 2>/dev/null | cut -d: -f7)"
fi
[ -z "$DEF_SHELL" ] && DEF_SHELL="/bin/sh"
[ -z "$SHELL_NAME" ] && SHELL_NAME="\${DEF_SHELL##*/}"

# Check if ~/.local/bin is ALREADY in PATH for default shell or active environment
ALREADY_IN_SHELL_PATH=0

if dir_in_path "$INSTALL_DIR" "$PATH"; then
    ALREADY_IN_SHELL_PATH=1
fi

if [ "$ALREADY_IN_SHELL_PATH" -eq 0 ] && ([ -x "$DEF_SHELL" ] || command -v "$DEF_SHELL" >/dev/null 2>&1); then
    DEF_LOGIN_PATH="$("$DEF_SHELL" -l -c 'printf %s "$PATH"' 2>/dev/null || "$DEF_SHELL" -l -c 'echo "$PATH"' 2>/dev/null || true)"
    if dir_in_path "$INSTALL_DIR" "$DEF_LOGIN_PATH"; then
        ALREADY_IN_SHELL_PATH=1
    fi
fi

if [ "$ALREADY_IN_SHELL_PATH" -eq 0 ] && ([ -x "$DEF_SHELL" ] || command -v "$DEF_SHELL" >/dev/null 2>&1); then
    DEF_CMD_PATH="$("$DEF_SHELL" -c 'printf %s "$PATH"' 2>/dev/null || "$DEF_SHELL" -c 'echo "$PATH"' 2>/dev/null || true)"
    if dir_in_path "$INSTALL_DIR" "$DEF_CMD_PATH"; then
        ALREADY_IN_SHELL_PATH=1
    fi
fi

if [ "$ALREADY_IN_SHELL_PATH" -eq 1 ]; then
    echo "  $INSTALL_DIR is already in your PATH ($DEF_SHELL)."
else
    # 1. POSIX baseline (for /bin/sh and Linux login/desktop sessions)
    add_to_posix_file "$HOME/.profile"

    # 2. Update default shell configuration
    case "$SHELL_NAME" in
        bash)
            add_to_posix_file "$HOME/.bashrc"
            if [ -f "$HOME/.bash_profile" ] || [ "$(uname -s)" = "Darwin" ]; then
                add_to_posix_file "$HOME/.bash_profile"
            fi
            ;;
        zsh)
            add_to_posix_file "$HOME/.zprofile"
            add_to_posix_file "$HOME/.zshrc"
            ;;
        fish)
            add_to_fish_file
            ;;
        sh)
            # Handled by ~/.profile above
            ;;
        *)
            if [ -f "$HOME/.bashrc" ]; then
                add_to_posix_file "$HOME/.bashrc"
            elif [ -f "$HOME/.zshrc" ]; then
                add_to_posix_file "$HOME/.zshrc"
            fi
            ;;
    esac

    # 3. Also append to other shells ONLY IF their configuration files already exist
    if [ -f "$HOME/.bashrc" ] && [ "$SHELL_NAME" != "bash" ]; then
        add_to_posix_file "$HOME/.bashrc"
    fi
    if [ -f "$HOME/.bash_profile" ] && [ "$SHELL_NAME" != "bash" ]; then
        add_to_posix_file "$HOME/.bash_profile"
    fi
    if [ -f "$HOME/.zshrc" ] && [ "$SHELL_NAME" != "zsh" ]; then
        add_to_posix_file "$HOME/.zshrc"
    fi
    if [ -f "$HOME/.config/fish/config.fish" ] && [ "$SHELL_NAME" != "fish" ]; then
        add_to_fish_file
    fi
    if [ -f "$HOME/.kshrc" ]; then
        add_to_posix_file "$HOME/.kshrc"
    fi
    if [ -f "$HOME/.cshrc" ] && ! already_in_file "$HOME/.cshrc"; then
        [ -s "$HOME/.cshrc" ] && [ -n "$(tail -c1 "$HOME/.cshrc" 2>/dev/null)" ] && printf '\\n' >> "$HOME/.cshrc"
        printf 'setenv PATH "$HOME/.local/bin:$PATH"\\n' >> "$HOME/.cshrc"
        echo "  Appended PATH to existing $HOME/.cshrc"
    fi
    if [ -f "$HOME/.config/nushell/env.nu" ] && ! already_in_file "$HOME/.config/nushell/env.nu"; then
        [ -s "$HOME/.config/nushell/env.nu" ] && [ -n "$(tail -c1 "$HOME/.config/nushell/env.nu" 2>/dev/null)" ] && printf '\\n' >> "$HOME/.config/nushell/env.nu"
        printf '$env.PATH = ($env.PATH | prepend $"($env.HOME)/.local/bin")\\n' >> "$HOME/.config/nushell/env.nu"
        echo "  Appended PATH to existing $HOME/.config/nushell/env.nu"
    fi
fi

export PATH="$INSTALL_DIR:$PATH"

# Remove legacy user identity file if present for privacy
rm -f "$HOME/.config/za/user" 2>/dev/null || true

# Determine source command for detected shell
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
    sh)
        RELOAD_CMD=". ~/.profile"
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
        if [ -f "$HOME/.bashrc" ]; then
            RELOAD_CMD="source ~/.bashrc"
        elif [ -f "$HOME/.zshrc" ]; then
            RELOAD_CMD="source ~/.zshrc"
        else
            RELOAD_CMD=". ~/.profile"
        fi
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
echo "  za \\"your question\\"      Ask anything / generate code"
echo "  za -o file.c prompt     Save clean code to file (No null errors!)"
echo "  za -t \\"hard problem\\"    Prioritize reasoning model"
echo "  za help                 Show all commands"
echo ""
if [ "$ALREADY_IN_SHELL_PATH" -eq 1 ]; then
    echo "You can run 'za' immediately in this terminal:"
    printf "  %bza help%b\\n" "$BLUE" "$RESET"
else
    echo "Run this now to enable 'za' in this terminal:"
    printf "  %b%s%b  (or open a new terminal)\\n" "$BLUE" "$RELOAD_CMD" "$RESET"
fi
echo ""
`;

  return new Response(shScript, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
};
