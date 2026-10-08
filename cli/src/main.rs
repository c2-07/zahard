use std::env;
use std::fs;
use std::io::{self, Write};
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
    username: Option<String>,
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

fn get_user_file() -> PathBuf {
    get_config_dir().join("user")
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

fn get_username() -> String {
    let user_file = get_user_file();
    if let Ok(content) = fs::read_to_string(user_file) {
        return content.trim().to_string();
    }
    "unknown".to_string()
}

fn cmd_login() {
    if is_logged_in() {
        let user = get_username();
        print!("You are already logged in as '{}'. Logout and re-login? [y/N]: ", user);
        io::stdout().flush().unwrap();
        let mut confirm = String::new();
        io::stdin().read_line(&mut confirm).unwrap();
        let confirm = confirm.trim().to_lowercase();
        if confirm.starts_with('y') {
            cmd_logout();
        } else {
            println!("Staying logged in as '{}'.", user);
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
        username: username.clone(),
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
        username: None,
    });

    if status != 200 || resp_body.success != Some(true) {
        eprintln!("Login failed: {}", resp_body.error.unwrap_or_else(|| "Unknown error".to_string()));
        process::exit(1);
    }

    if let Some(cookie) = set_cookie {
        fs::write(get_cookie_file(), cookie).unwrap();
    } else {
        eprintln!("Login failed or no cookie returned from server.");
        process::exit(1);
    }

    let saved_username = resp_body.username.unwrap_or(username);
    fs::write(get_user_file(), &saved_username).unwrap();

    println!("Logged in successfully as '{}'.", saved_username);
}

fn cmd_logout() {
    if !is_logged_in() {
        println!("You are not logged in.");
        return;
    }

    let user = get_username();
    println!("Logging out from '{}'...", user);

    let api_url = format!("{}/auth/logout", get_api_url());
    let cookie_val = fs::read_to_string(get_cookie_file()).unwrap_or_default();
    
    // Ignore result
    let _ = ureq::post(&api_url)
        .set("Cookie", &cookie_val)
        .call();

    let _ = fs::remove_file(get_cookie_file());
    let _ = fs::remove_file(get_user_file());
    
    println!("Logged out successfully.");
}

fn cmd_whoami() {
    if !is_logged_in() {
        println!("Not logged in.");
        println!("Run 'za login' to log in.");
        return;
    }
    println!("Logged in as: {}", get_username());
}

fn cmd_uninstall() {
    println!("Uninstalling 'za' CLI data...");
    let config_dir = get_config_dir();
    let _ = fs::remove_dir_all(config_dir);
    println!("Uninstalled successfully. Note: To fully remove the binary, delete the executable file from your PATH.");
}

fn print_usage() {
    println!("Usage: za [OPTIONS] <PROMPT>");
    println!();
    println!("Commands (Shortcuts):");
    println!("  login     (-l)      Log in to your account");
    println!("  logout    (-lo)     Log out from your account");
    println!("  whoami    (-w, -s)  Show current logged-in account info");
    println!("  uninstall (-u)      Remove CLI data from your system");
    println!("  help      (-h)      Show this usage guide");
    println!();
    println!("Options:");
    println!("  -t                  Prioritize the Gemini reasoning model");
}

fn cmd_make(prompt: &str, thinking: bool) {
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
        println!("{}", text);
    } else if let Some(err) = resp_body.error {
        eprintln!("{}", err);
        process::exit(1);
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        print_usage();
        return;
    }

    let cmd = args[1].as_str();

    match cmd {
        "help" | "--help" | "-h" => {
            print_usage();
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

    let mut thinking = false;
    let mut prompt_parts = Vec::new();

    let mut start_idx = 1;
    if args[1] == "-t" {
        thinking = true;
        start_idx = 2;
    }

    for arg in &args[start_idx..] {
        prompt_parts.push(arg.as_str());
    }

    let prompt = prompt_parts.join(" ").trim().to_string();

    if prompt.is_empty() {
        eprintln!("Error: Prompt cannot be empty.");
        print_usage();
        process::exit(1);
    }

    cmd_make(&prompt, thinking);
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
        
        let user_file = get_user_file();
        assert!(user_file.ends_with("user"));
    }
}
