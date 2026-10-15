#!/bin/sh
set -e

INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

# Repository information
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

BINARY_NAME="za-${OS_NAME}-${ARCH_NAME}${EXT}"
DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/latest/download/$BINARY_NAME"
TARGET_BIN="$INSTALL_DIR/za${EXT}"

mkdir -p "$INSTALL_DIR"

echo "Detected system: $OS_NAME ($ARCH_NAME)"
echo "Downloading $BINARY_NAME from $DOWNLOAD_URL..."

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
    # Create file if doesn't exist
    [ -f "$file" ] || touch "$file"
    if ! grep -q "$INSTALL_DIR" "$file"; then
        printf '\n%s\n' "$line_to_add" >> "$file"
        echo "  Added $INSTALL_DIR to PATH in $file"
    fi
}

# Detect shell from $SHELL env, or try to detect from /etc/passwd
SHELL_NAME="${SHELL##*/}"
DETECTED=0

case "$SHELL_NAME" in
    zsh)
        add_to_path "$HOME/.zshrc" 'export PATH="$HOME/.local/bin:$PATH"'
        DETECTED=1
        ;;
    bash)
        add_to_path "$HOME/.bashrc" 'export PATH="$HOME/.local/bin:$PATH"'
        # macOS bash reads .bash_profile for login shells
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
        # ksh also uses .profile for login shells
        add_to_path "$HOME/.profile" 'export PATH="$HOME/.local/bin:$PATH"'
        DETECTED=1
        ;;
    csh|tcsh)
        add_to_path "$HOME/.cshrc" 'setenv PATH "$HOME/.local/bin:$PATH"'
        DETECTED=1
        ;;
    nu|nushell)
        mkdir -p "$HOME/.config/nushell"
        add_to_path "$HOME/.config/nushell/env.nu" '\$env.PATH = (\$env.PATH | prepend \$"(\$env.HOME)/.local/bin")'
        DETECTED=1
        ;;
esac

# Always add to .profile as a universal fallback for POSIX login shells
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

BLUE='\033[1;34m'
RESET='\033[0m'

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
printf "  %b%s%b\n" "$BLUE" "$RELOAD_CMD" "$RESET"
echo ""
