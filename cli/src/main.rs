use std::env;
use std::fs;
use std::io::{self, IsTerminal, Read, Write};
use std::path::PathBuf;
use std::process;

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
struct LoginResponse {
    success: Option<bool>,
    error: Option<String>,
}

#[derive(Serialize)]
struct MakeRequest {
    prompt: String,
    thinking: bool,
}

#[derive(Deserialize)]
struct MakeResponse {
    text: Option<String>,
    error: Option<String>,
    details: Option<serde_json::Value>,
}

const DEFAULT_API_URL: &str = match option_env!("ZA_DEFAULT_API_URL") {
    Some(url) => url,
    None => "http://localhost:4321/api",
};

fn get_config_dir() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| {
        let home = dirs::home_dir().expect("Could not find home directory");
        home.join(".config")
    });
    path.push("za");
    path
}

fn get_cookie_file() -> PathBuf {
    get_config_dir().join("cookie")
}

// Clean up any legacy user identity file to protect privacy on shared/lab PCs
fn clean_legacy_user_file() {
    let user_file = get_config_dir().join("user");
    if user_file.exists() {
        let _ = fs::remove_file(user_file);
    }
}

fn get_api_url() -> String {
    env::var("ZA_API_URL").unwrap_or_else(|_| DEFAULT_API_URL.to_string())
}

fn is_logged_in() -> bool {
    let cookie_file = get_cookie_file();
    if !cookie_file.exists() {
        return false;
    }
    if let Ok(content) = fs::read_to_string(cookie_file) {
        return content.contains("session");
    }
    false
}

fn cmd_login() {
    clean_legacy_user_file();
    if is_logged_in() {
        print!("Already authenticated. Logout and re-login? [y/N]: ");
        io::stdout().flush().unwrap();
        let mut confirm = String::new();
        io::stdin().read_line(&mut confirm).unwrap();
        let confirm = confirm.trim().to_lowercase();
        if confirm.starts_with('y') {
            cmd_logout();
        } else {
            println!("Remaining authenticated.");
            return;
        }
    }

    print!("Username: ");
    io::stdout().flush().unwrap();
    let mut username = String::new();
    io::stdin().read_line(&mut username).unwrap();
    let username = username.trim().to_string();

    let password = rpassword::prompt_password("Password: ").unwrap();
    println!();

    let config_dir = get_config_dir();
    fs::create_dir_all(&config_dir).unwrap();

    let api_url = format!("{}/auth/login", get_api_url());
    let req_body = LoginRequest {
        username,
        password,
    };

    let resp = match ureq::post(&api_url).send_json(req_body) {
        Ok(r) => r,
        Err(ureq::Error::Status(_, r)) => r,
        Err(e) => {
            eprintln!("Login failed. Network error: {}", e);
            process::exit(1);
        }
    };

    let status = resp.status();
    let set_cookie = resp.header("set-cookie").map(|s| s.to_string());
    
    let resp_body: LoginResponse = resp.into_json().unwrap_or_else(|_| LoginResponse {
        success: Some(false),
        error: Some("Failed to parse response".to_string()),
    });

    if status != 200 || resp_body.success != Some(true) {
        eprintln!("Login failed: {}", resp_body.error.unwrap_or_else(|| "Unknown error".to_string()));
        process::exit(1);
    }

    if let Some(cookie) = set_cookie {
        let cookie_path = get_cookie_file();
        fs::write(&cookie_path, cookie).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = fs::metadata(&cookie_path) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o600);
                let _ = fs::set_permissions(&cookie_path, perms);
            }
        }
    } else {
        eprintln!("Login failed or no cookie returned from server.");
        process::exit(1);
    }

    clean_legacy_user_file();
    println!("Logged in successfully.");
}

fn cmd_logout() {
    clean_legacy_user_file();
    if !is_logged_in() {
        println!("You are not logged in.");
        return;
    }

    println!("Logging out...");

    let api_url = format!("{}/auth/logout", get_api_url());
    let cookie_val = fs::read_to_string(get_cookie_file()).unwrap_or_default();
    
    // Ignore result
    let _ = ureq::post(&api_url)
        .set("Cookie", &cookie_val)
        .call();

    let _ = fs::remove_file(get_cookie_file());
    clean_legacy_user_file();
    
    println!("Logged out successfully.");
}

fn cmd_whoami() {
    clean_legacy_user_file();
    if !is_logged_in() {
        println!("Not logged in.");
        println!("Run 'za login' to log in.");
        return;
    }
    println!("Status: Active (Authenticated)");
}

fn cmd_uninstall() {
    println!("Uninstalling 'za' CLI data...");
    let config_dir = get_config_dir();
    let _ = fs::remove_dir_all(config_dir);
    println!("Uninstalled successfully. Note: To fully remove the binary, delete the executable file from your PATH.");
}

fn cmd_version() {
    println!("za v{}", env!("CARGO_PKG_VERSION"));
}

fn cmd_update() {
    println!("Updating 'za' CLI to the latest version...");
    let install_url = env::var("ZA_INSTALL_URL").unwrap_or_else(|_| "https://zahard.vercel.app/install".to_string());

    #[cfg(windows)]
    {
        let ps_cmd = format!("irm {} | iex", install_url);
        let status = process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_cmd])
            .status();
        match status {
            Ok(s) if s.success() => println!("Update completed successfully!"),
            _ => {
                eprintln!("Automatic update failed. Run this command manually in PowerShell:");
                eprintln!("  irm {} | iex", install_url);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let sh_cmd = format!("curl -fsSL {} | bash", install_url);
        let status = process::Command::new("sh")
            .arg("-c")
            .arg(&sh_cmd)
            .status();
        match status {
            Ok(s) if s.success() => println!("Update completed successfully!"),
            _ => {
                eprintln!("Automatic update failed. Run this command manually in your terminal:");
                eprintln!("  curl -fsSL {} | bash", install_url);
            }
        }
    }
}

pub fn build_piped_prompt(user_prompt: &str, piped_input: &str) -> Option<String> {
    let clean_prompt = trim_outer_quotes(user_prompt.trim());
    let clean_piped = piped_input.trim();

    match (!clean_prompt.is_empty(), !clean_piped.is_empty()) {
        (true, true) => Some(format!("{}\n\n[Piped Input / Code]:\n```\n{}\n```", clean_prompt, clean_piped)),
        (true, false) => Some(clean_prompt.to_string()),
        (false, true) => Some(clean_piped.to_string()),
        (false, false) => None,
    }
}

fn print_usage() {
    println!("za - minimal AI assistant & code generator (v{})", env!("CARGO_PKG_VERSION"));
    println!();
    println!("Usage:");
    println!("  za [OPTIONS] <PROMPT...>");
    println!("  za <COMMAND>");
    println!("  cat <FILE> | za [OPTIONS] [PROMPT]");
    println!();
    println!("Commands:");
    println!("  login      (-l)       Log in to your account");
    println!("  logout     (-lo)      Log out from your account");
    println!("  status     (-s,-w)    Check session status");
    println!("  update                Update CLI to latest version");
    println!("  version    (-v)       Show current CLI version");
    println!("  uninstall  (-u)       Remove CLI data from system");
    println!("  help       (-h)       Show this help message");
    println!();
    println!("Options:");
    println!("  -o, --output <FILE>   Save clean code directly to file (No null errors)");
    println!("  -t, --thinking        Prioritize reasoning model");
    println!("  -v, --version         Show CLI version");
    println!();
    println!("Examples:");
    println!("  za Explain binary search in simple terms");
    println!("  za \"Explain binary search\"");
    println!("  za -o hello.c write hello world in c");
    println!("  cat solution.c | za \"find the memory leak\"");
    println!("  gcc main.c 2>&1 | za \"how to fix this compilation error\"");
    println!("  za -t \"solve traveling salesperson problem\"");
}

pub fn sanitize_output(text: &str, is_file_output: bool) -> String {
    // 1. Remove literal null bytes (\0)
    let mut clean = text.replace('\0', "");

    // 2. Strip UTF-8 BOM (\u{FEFF})
    if clean.starts_with('\u{FEFF}') {
        clean = clean.trim_start_matches('\u{FEFF}').to_string();
    }

    // 3. Remove zero-width characters that cause compiler errors
    clean = clean.replace('\u{200B}', "") // zero-width space
                 .replace('\u{200C}', "") // zero-width non-joiner
                 .replace('\u{200D}', ""); // zero-width joiner

    // 4. Normalize non-breaking spaces (\u{00A0}) to standard spaces
    clean = clean.replace('\u{00A0}', " ");

    // 5. If writing directly to a source file, unwrap Markdown code fences
    if is_file_output {
        let trimmed = clean.trim();
        if trimmed.starts_with("```") {
            if let Some(first_nl) = trimmed.find('\n') {
                let after_open = &trimmed[first_nl + 1..];
                if let Some(last_fence) = after_open.rfind("```") {
                    return after_open[..last_fence].trim_end().to_string();
                }
            }
        }
    }

    clean
}

pub fn trim_outer_quotes(s: &str) -> &str {
    let trimmed = s.trim();
    if (trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2)
        || (trimmed.starts_with('\'') && trimmed.ends_with('\'') && trimmed.len() >= 2)
    {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    }
}

fn cmd_make(prompt: &str, thinking: bool, output_file: Option<&str>) {
    clean_legacy_user_file();
    if !is_logged_in() {
        eprintln!("Error: Not logged in.");
        eprintln!("Please run: za login");
        process::exit(1);
    }

    let cookie_val = fs::read_to_string(get_cookie_file()).unwrap_or_default();
    let api_url = format!("{}/make", get_api_url());
    
    let req_body = MakeRequest {
        prompt: prompt.to_string(),
        thinking,
    };

    let resp = match ureq::post(&api_url)
        .set("Cookie", &cookie_val)
        .send_json(req_body) {
        Ok(r) => r,
        Err(ureq::Error::Status(_, r)) => r,
        Err(e) => {
            eprintln!("Request failed. Network error: {}", e);
            process::exit(1);
        }
    };

    let status = resp.status();
    let resp_body: MakeResponse = resp.into_json().unwrap_or_else(|_| MakeResponse {
        error: Some("Failed to parse response".to_string()),
        text: None,
        details: None,
    });

    if status != 200 {
        if status == 429 {
            eprintln!("Rate limit reached: {}", resp_body.error.unwrap_or_else(|| "Daily limit of 100 requests reached. Quota resets at midnight UTC.".to_string()));
            process::exit(1);
        }
        eprintln!("Request failed (HTTP Status: {})", status);
        if let Some(err) = resp_body.error {
            eprintln!("{}", err);
        }
        if let Some(obj) = resp_body.details.as_ref().and_then(|d| d.as_object()) {
            for (k, v) in obj {
                eprintln!("- {}: {}", k, v);
            }
        }
        process::exit(1);
    }

    if let Some(text) = resp_body.text {
        if let Some(file_path) = output_file {
            let sanitized = sanitize_output(&text, true);
            match fs::write(file_path, sanitized.as_bytes()) {
                Ok(_) => {
                    println!("Code successfully saved to '{}'.", file_path);
                }
                Err(e) => {
                    eprintln!("Error saving code to '{}': {}", file_path, e);
                    process::exit(1);
                }
            }
        } else {
            let sanitized = sanitize_output(&text, false);
            println!("{}", sanitized);
        }
    } else if let Some(err) = resp_body.error {
        eprintln!("{}", err);
        process::exit(1);
    }
}

fn main() {
    let raw_args: Vec<String> = env::args().collect();

    // Check for piped stdin (e.g., cat file.c | za "prompt" or cat file.c | za)
    let mut piped_input = String::new();
    if !io::stdin().is_terminal() {
        let _ = io::stdin().read_to_string(&mut piped_input);
    }
    let has_pipe = !piped_input.trim().is_empty();

    if raw_args.len() < 2 && !has_pipe {
        print_usage();
        return;
    }

    // Check if first argument is a standalone command
    if raw_args.len() >= 2 {
        let first = raw_args[1].as_str();
        match first {
            "help" | "--help" | "-h" => {
                print_usage();
                return;
            }
            "version" | "--version" | "-v" => {
                cmd_version();
                return;
            }
            "update" => {
                cmd_update();
                return;
            }
            "uninstall" | "-u" | "--uninstall" => {
                cmd_uninstall();
                return;
            }
            "login" | "-l" | "--login" => {
                cmd_login();
                return;
            }
            "logout" | "-lo" | "--logout" => {
                cmd_logout();
                return;
            }
            "whoami" | "status" | "-s" | "--status" | "-w" | "--whoami" => {
                cmd_whoami();
                return;
            }
            _ => {}
        }
    }

    let mut thinking = false;
    let mut output_file: Option<String> = None;
    let mut prompt_tokens = Vec::new();

    let mut idx = 1;
    while idx < raw_args.len() {
        let arg = &raw_args[idx];
        if arg == "-t" || arg == "--thinking" {
            thinking = true;
            idx += 1;
        } else if arg == "-v" || arg == "--version" {
            cmd_version();
            return;
        } else if arg == "-o" || arg == "--output" {
            idx += 1;
            if idx < raw_args.len() {
                output_file = Some(raw_args[idx].clone());
                idx += 1;
            } else {
                eprintln!("Error: -o / --output requires a file path argument.");
                process::exit(1);
            }
        } else if let Some(val) = arg.strip_prefix("-o=") {
            output_file = Some(val.to_string());
            idx += 1;
        } else if let Some(val) = arg.strip_prefix("--output=") {
            output_file = Some(val.to_string());
            idx += 1;
        } else {
            prompt_tokens.push(arg.as_str());
            idx += 1;
        }
    }

    let joined_prompt = prompt_tokens.join(" ");
    let final_prompt = match build_piped_prompt(&joined_prompt, &piped_input) {
        Some(p) => p,
        None => {
            eprintln!("Error: Prompt cannot be empty.");
            print_usage();
            process::exit(1);
        }
    };

    cmd_make(&final_prompt, thinking, output_file.as_deref());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_paths() {
        let config_dir = get_config_dir();
        assert!(config_dir.ends_with("za"));
        
        let cookie_file = get_cookie_file();
        assert!(cookie_file.ends_with("cookie"));
    }

    #[test]
    fn test_trim_outer_quotes() {
        assert_eq!(trim_outer_quotes("\"hello world\""), "hello world");
        assert_eq!(trim_outer_quotes("'hello world'"), "hello world");
        assert_eq!(trim_outer_quotes("hello world"), "hello world");
        assert_eq!(trim_outer_quotes("  \"quoted\"  "), "quoted");
    }

    #[test]
    fn test_sanitize_output_null_and_bom() {
        let dirty = "\u{FEFF}#include <stdio.h>\0\nint main() {\0 return 0; }";
        let clean = sanitize_output(dirty, false);
        assert!(!clean.contains('\0'));
        assert!(!clean.contains('\u{FEFF}'));
        assert!(clean.contains("#include <stdio.h>"));
    }

    #[test]
    fn test_sanitize_output_unwraps_code_fence() {
        let markdown = "```c\n#include <stdio.h>\nint main() { return 0; }\n```";
        let clean = sanitize_output(markdown, true);
        assert_eq!(clean, "#include <stdio.h>\nint main() { return 0; }");
    }

    #[test]
    fn test_sanitize_output_zero_width() {
        let text = "int\u{200B} a\u{00A0}=\u{200C} 5;";
        let clean = sanitize_output(text, false);
        assert_eq!(clean, "int a = 5;");
    }

    #[test]
    fn test_build_piped_prompt_combined() {
        let prompt = build_piped_prompt("find bug", "int main() { return 0; }");
        assert!(prompt.is_some());
        let res = prompt.unwrap();
        assert!(res.starts_with("find bug"));
        assert!(res.contains("int main() { return 0; }"));
        assert!(res.contains("[Piped Input / Code]:"));
    }

    #[test]
    fn test_build_piped_prompt_pipe_only() {
        let prompt = build_piped_prompt("", "int main() { return 0; }");
        assert_eq!(prompt.unwrap(), "int main() { return 0; }");
    }

    #[test]
    fn test_build_piped_prompt_user_only() {
        let prompt = build_piped_prompt("what is polymorphism?", "");
        assert_eq!(prompt.unwrap(), "what is polymorphism?");
    }

    #[test]
    fn test_build_piped_prompt_empty() {
        let prompt = build_piped_prompt("  ", "");
        assert!(prompt.is_none());
    }
}
