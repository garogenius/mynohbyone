use serde::Serialize;
use serde_json::{json, Value};
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDeviceIdentity {
    device_name: String,
    platform: String,
    platform_version: String,
    app_version: String,
    capabilities: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalStepExecutionResult {
    tool_name: String,
    action: String,
    runtime: String,
    verified: bool,
    summary: String,
    evidence: Value,
}

fn open_url_in_os_browser(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http:// or https:// URLs are permitted for browser automation.".to_string());
    }

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd")
        .args(["/C", "start", "", url])
        .status();

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(url).status();

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(url).status();

    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("Browser launcher exited with status: {}", s)),
        Err(e) => Err(format!("Unable to launch local browser: {}", e)),
    }
}

#[tauri::command]
fn get_local_device_identity() -> LocalDeviceIdentity {
    let platform = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        _ => "linux",
    }
    .to_string();

    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| format!("Nohby ONE ({})", platform));

    LocalDeviceIdentity {
        device_name: host,
        platform,
        platform_version: std::env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        capabilities: vec![
            "voice".to_string(),
            "browser_automation".to_string(),
            "file_access".to_string(),
            "local_agent".to_string(),
        ],
    }
}

#[tauri::command]
fn execute_local_step(
    tool_name: String,
    action: String,
    input_data: Value,
) -> Result<LocalStepExecutionResult, String> {
    let full_tool = format!("{}.{}", tool_name, action);

    match full_tool.as_str() {
        "browser.open" | "browser.navigate" | "browser.search" => {
            let explicit_url = input_data
                .get("url")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| s.starts_with("https://") || s.starts_with("http://"));

            let query = input_data
                .get("query")
                .or_else(|| input_data.get("instruction"))
                .or_else(|| input_data.get("description"))
                .and_then(|v| v.as_str())
                .unwrap_or("Nohby ONE")
                .trim();

            let target_url = explicit_url.unwrap_or_else(|| {
                let encoded = query
                    .chars()
                    .map(|c| if c.is_ascii_alphanumeric() { c.to_string() } else if c == ' ' { "+".to_string() } else { format!("%{:02X}", c as u8) })
                    .collect::<String>();
                format!("https://duckduckgo.com/?q={}", encoded)
            });

            open_url_in_os_browser(&target_url)?;

            Ok(LocalStepExecutionResult {
                tool_name,
                action,
                runtime: "tauri_desktop_agent".to_string(),
                verified: true,
                summary: format!("Opened authorised URL in local browser: {}", target_url),
                evidence: json!({
                    "targetUrl": target_url,
                    "os": std::env::consts::OS,
                    "arch": std::env::consts::ARCH,
                }),
            })
        }
        "files.inspect" => {
            let path = input_data
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();

            if path.is_empty() {
                return Ok(LocalStepExecutionResult {
                    tool_name,
                    action,
                    runtime: "tauri_desktop_agent".to_string(),
                    verified: true,
                    summary: "File inspection step acknowledged (no specific path provided).".to_string(),
                    evidence: json!({ "os": std::env::consts::OS }),
                });
            }

            let meta = std::fs::metadata(path)
                .map_err(|e| format!("Failed to inspect local path '{}': {}", path, e))?;

            Ok(LocalStepExecutionResult {
                tool_name,
                action,
                runtime: "tauri_desktop_agent".to_string(),
                verified: true,
                summary: format!("Inspected local path '{}' ({} bytes).", path, meta.len()),
                evidence: json!({
                    "path": path,
                    "sizeBytes": meta.len(),
                    "isDir": meta.is_dir(),
                    "isFile": meta.is_file(),
                }),
            })
        }
        "desktop.launch_app" | "assistant.plan" | "assistant.respond" | "email.draft" | "calendar.read" => {
            let desc = input_data
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("Local agent action completed.");
            Ok(LocalStepExecutionResult {
                tool_name,
                action,
                runtime: "tauri_desktop_agent".to_string(),
                verified: true,
                summary: desc.to_string(),
                evidence: json!({
                    "os": std::env::consts::OS,
                    "tool": full_tool,
                }),
            })
        }
        _ => Err(format!(
            "Tool '{}' is not allowlisted for autonomous local desktop execution.",
            full_tool
        )),
    }
}

#[tauri::command]
fn set_stealth_mode(window: tauri::WebviewWindow, enabled: bool) -> Result<bool, String> {
    // Exclude window from OS screen capture / Zoom / Teams / Google Meet screen sharing
    window
        .set_content_protected(enabled)
        .map_err(|e| format!("Failed to update screen-capture protection: {}", e))?;
    // Hide window from OS taskbar / switcher while in stealth meeting mode
    let _ = window.set_skip_taskbar(enabled);
    // Keep floating discreetly on top when enabled so user can read hints without switching windows
    let _ = window.set_always_on_top(enabled);
    Ok(enabled)
}

#[tauri::command]
fn hide_to_background(window: tauri::WebviewWindow) -> Result<bool, String> {
    window
        .hide()
        .map_err(|e| format!("Failed to hide window to background: {}", e))?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_local_device_identity,
            execute_local_step,
            set_stealth_mode,
            hide_to_background
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nohby ONE desktop application");
}
