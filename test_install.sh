#!/bin/sh
set -e

INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/za" <<'EOF'
#!/bin/sh
set -e

API_URL="http://localhost:4321/api"
CONFIG_DIR="$HOME/.config/za"
COOKIE_FILE="$CONFIG_DIR/cookie"
USER_FILE="$CONFIG_DIR/user"
INSTALL_DIR="$HOME/.local/bin"

_usage() {
    echo "Usage: za [OPTIONS] <PROMPT>"
    echo ""
    echo "Commands:"
    echo "  login        Log in to your account"
    echo "  logout       Log out from your account"
    echo "  whoami       Show current logged-in account info"
    echo "  uninstall    Remove the CLI from your system"
    echo "  help         Show this usage guide"
    echo ""
    echo "Options:"
    echo "  -t           Prioritize the Gemini reasoning model"
    echo ""
    echo "Examples:"
    echo "  za login"
    echo "  za logout"
    echo "  za whoami"
    echo "  za \"write a python script to parse logs\""
    echo "  za -t \"explain quantum physics\""
}

_is_logged_in() {
    [ -f "$COOKIE_FILE" ] && grep -q "session" "$COOKIE_FILE" 2>/dev/null
}

_get_username() {
    if [ -f "$USER_FILE" ]; then
        cat "$USER_FILE"
    else
        echo "unknown"
    fi
}

_uninstall() {
    echo "Uninstalling 'za' CLI..."
    rm -f "$INSTALL_DIR/za"
    rm -rf "$CONFIG_DIR"
    echo "Uninstalled successfully."
    echo "Note: You may want to manually remove $INSTALL_DIR from your PATH if you don't use it for other tools."
    exit 0
}

_logout() {
    if ! _is_logged_in; then
        echo "You are not logged in."
        exit 0
    fi

    logged_user=$(_get_username)
    echo "Logging out from '$logged_user'..."

    # Notify the server to invalidate the session
    curl -sSL -b "$COOKIE_FILE" -X POST "$API_URL/auth/logout" >/dev/null 2>&1 || true

    rm -f "$COOKIE_FILE" "$USER_FILE"
    echo "Logged out successfully."
}

_whoami() {
    if ! _is_logged_in; then
        echo "Not logged in."
        echo "Run 'za login' to log in."
        exit 0
    fi

    logged_user=$(_get_username)
    echo "Logged in as: $logged_user"
}

_do_login() {
    printf "Username: "
    read -r username
    printf "Password: "
    stty -echo 2>/dev/null || true
    read -r password
    stty echo 2>/dev/null || true
    printf "\n"

    mkdir -p "$CONFIG_DIR"

    if ! curl_output=$(curl -sSL -c "$COOKIE_FILE" -H 'Content-Type: application/json' --data "{\"username\":\"$username\",\"password\":\"$password\"}" "$API_URL/auth/login" 2>&1); then
        echo "Login failed. Network error or incorrect credentials." >&2
        rm -f "$COOKIE_FILE" "$USER_FILE"
        exit 1
    fi

    if ! grep -q "session" "$COOKIE_FILE" 2>/dev/null; then
        echo "Login failed or no cookie returned from server." >&2
        rm -f "$COOKIE_FILE" "$USER_FILE"
        exit 1
    fi

    # Save the username locally for whoami/status
    echo "$username" > "$USER_FILE"
    echo "Logged in successfully as '$username'."
}

_login() {
    if _is_logged_in; then
        logged_user=$(_get_username)
        printf "You are already logged in as '%s'. Logout and re-login? [y/N]: " "$logged_user"
        read -r confirm
        case "$confirm" in
            [yY]|[yY][eE][sS])
                # Logout first, then continue to login
                curl -sSL -b "$COOKIE_FILE" -X POST "$API_URL/auth/logout" >/dev/null 2>&1 || true
                rm -f "$COOKIE_FILE" "$USER_FILE"
                echo "Logged out from '$logged_user'."
                ;;
            *)
                echo "Staying logged in as '$logged_user'."
                exit 0
                ;;
        esac
    fi

    _do_login
}

if [ -z "$1" ] || [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    _usage
    exit 0
fi

if [ "$1" = "uninstall" ]; then
    _uninstall
fi

if [ "$1" = "login" ]; then
    _login
    exit 0
fi

if [ "$1" = "logout" ]; then
    _logout
    exit 0
fi

if [ "$1" = "whoami" ] || [ "$1" = "status" ]; then
    _whoami
    exit 0
fi

if [ ! -f "$COOKIE_FILE" ] || ! grep -q "session" "$COOKIE_FILE" 2>/dev/null; then
    echo "Error: Not logged in." >&2
    echo "Please run: za login" >&2
    exit 1
fi

THINKING="false"
if [ "$1" = "-t" ]; then
    THINKING="true"
    shift
fi

PROMPT="$*"
if [ -z "$PROMPT" ]; then
    echo "Error: Prompt cannot be empty." >&2
    _usage
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "Error: 'jq' is not installed. Please install it to use this CLI." >&2
    exit 1
fi

# Escape JSON for curl
ESCAPED_PROMPT=$(echo "$PROMPT" | jq -R -s -c '.')

RESPONSE=$(curl -sSL \
    -b "$COOKIE_FILE" \
    -w "\n%{http_code}" \
    -H 'Content-Type: application/json' \
    --data "{\"prompt\":${ESCAPED_PROMPT}, \"thinking\": $THINKING}" \
    "$API_URL/make")

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$ d')

if [ "$HTTP_STATUS" != "200" ]; then
    echo "Request failed (HTTP Status: $HTTP_STATUS)" >&2
    if echo "$BODY" | grep -q '^{'; then
        echo "$BODY" | jq -r 'if type == "object" then if .details then (.error + "\n" + (.details | to_entries | map("- \(.key): \(.value)") | join("\n"))) else .error end else . end' >&2
    else
        echo "Unknown error occurred: $BODY" >&2
    fi
    exit 1
fi

echo "$BODY" | jq -r '.text // .error'
EOF

chmod +x "$INSTALL_DIR/za"

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

echo ""
echo "----------------------------------------"
echo "  Successfully installed 'za' CLI!"
echo "----------------------------------------"
if [ "$SHELL_NAME" = "fish" ]; then
    echo "Please run 'source ~/.config/fish/config.fish' or restart your terminal."
elif [ "$SHELL_NAME" = "nu" ] || [ "$SHELL_NAME" = "nushell" ]; then
    echo "Please run 'source ~/.config/nushell/env.nu' or restart your terminal."
else
    echo "Please restart your terminal or run: . ~/.${SHELL_NAME}rc"
fi
echo ""
echo "Getting started:"
echo "  1. Login:   za login"
echo "  2. Ask:     za \"Hello world!\""
echo "  3. Status:  za whoami"
echo "  4. Logout:  za logout"
echo "  5. Help:    za help"
