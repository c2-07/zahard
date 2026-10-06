import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const apiUrl = `${baseUrl}/api`;

  const script = `#!/bin/sh
set -e

INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/ass" <<'EOF'
#!/bin/sh
set -e

API_URL="${apiUrl}"
COOKIE_FILE="$HOME/.config/ass/cookie"
INSTALL_DIR="$HOME/.local/bin"

_usage() {
    echo "Usage: ass [OPTIONS] <PROMPT>"
    echo ""
    echo "Commands:"
    echo "  login        Log in to your account"
    echo "  uninstall    Remove the CLI from your system"
    echo "  help         Show this usage guide"
    echo ""
    echo "Options:"
    echo "  -t           Prioritize the Gemini reasoning model"
    echo ""
    echo "Examples:"
    echo "  ass login"
    echo "  ass \\"write a python script to parse logs\\""
    echo "  ass -t \\"explain quantum physics\\""
}

_uninstall() {
    echo "Uninstalling 'ass' CLI..."
    rm -f "$INSTALL_DIR/ass"
    rm -rf "$(dirname "$COOKIE_FILE")"
    echo "Uninstalled successfully."
    echo "Note: You may want to manually remove $INSTALL_DIR from your PATH if you don't use it for other tools."
    exit 0
}

_login() {
    printf "Username: "
    read -r username
    printf "Password: "
    stty -echo 2>/dev/null || true
    read -r password
    stty echo 2>/dev/null || true
    printf "\\n"

    mkdir -p "$(dirname "$COOKIE_FILE")"

    if ! curl_output=$(curl -fsSL -c "$COOKIE_FILE" -H 'Content-Type: application/json' --data "{\\"username\\":\\"$username\\",\\"password\\":\\"$password\\"}" "$API_URL/auth/login" 2>&1); then
        echo "Login failed. Network error or incorrect credentials." >&2
        rm -f "$COOKIE_FILE"
        exit 1
    fi

    if ! grep -q "session" "$COOKIE_FILE"; then
        echo "Login failed or no cookie returned from server." >&2
        rm -f "$COOKIE_FILE"
        exit 1
    fi
    echo "Logged in successfully."
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

if [ ! -f "$COOKIE_FILE" ]; then
    echo "Error: Not logged in." >&2
    echo "Please run: ass login" >&2
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

RESPONSE=$(curl -sSL \\
    -b "$COOKIE_FILE" \\
    -w "\\n%{http_code}" \\
    -H 'Content-Type: application/json' \\
    --data "{\\"prompt\\":\${ESCAPED_PROMPT}, \\"thinking\\": $THINKING}" \\
    "$API_URL/make")

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$ d')

if [ "$HTTP_STATUS" != "200" ]; then
    echo "Request failed (HTTP Status: $HTTP_STATUS)" >&2
    if echo "$BODY" | grep -q '^{'; then
        echo "$BODY" | jq -r 'if type == "object" then if .details then (.error + "\\n" + (.details | to_entries | map("- \\(.key): \\(.value)") | join("\\n"))) else .error end else . end' >&2
    else
        echo "Unknown error occurred: $BODY" >&2
    fi
    exit 1
fi

echo "$BODY" | jq -r '.text // .error'
EOF

chmod +x "$INSTALL_DIR/ass"

# --- PATH Configuration ---
add_to_path() {
    file="$1"
    line_to_add="$2"
    # Create file if doesn't exist
    [ -f "$file" ] || touch "$file"
    if ! grep -q "$INSTALL_DIR" "$file"; then
        printf '\\n%s\\n' "$line_to_add" >> "$file"
        echo "Added $INSTALL_DIR to PATH in $file"
    fi
}

SHELL_NAME="\${SHELL##*/}"
case "$SHELL_NAME" in
    zsh)
        add_to_path "$HOME/.zshrc" 'export PATH="$HOME/.local/bin:$PATH"'
        ;;
    bash)
        add_to_path "$HOME/.bashrc" 'export PATH="$HOME/.local/bin:$PATH"'
        if [ "$OSTYPE" = "darwin"* ]; then
            add_to_path "$HOME/.bash_profile" 'export PATH="$HOME/.local/bin:$PATH"'
        fi
        ;;
    fish)
        mkdir -p "$HOME/.config/fish"
        add_to_path "$HOME/.config/fish/config.fish" 'set -gx PATH "$HOME/.local/bin" $PATH'
        ;;
    *)
        echo "Unsupported shell ($SHELL_NAME). Please manually add $INSTALL_DIR to your PATH."
        ;;
esac

export PATH="$INSTALL_DIR:$PATH"

echo "----------------------------------------"
echo "Successfully installed 'ass' CLI!"
echo "----------------------------------------"
if [ "$SHELL_NAME" = "fish" ]; then
    echo "Please run 'source ~/.config/fish/config.fish' or restart your terminal."
else
    echo "Please run 'source ~/.\${SHELL_NAME}rc' or restart your terminal."
fi
echo ""
echo "Getting started:"
echo "  1. Login: ass login"
echo "  2. Ask:   ass \\"Hello world!\\""
echo "  3. Help:  ass help"
`;

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain'
    }
  });
};
