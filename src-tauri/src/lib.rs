use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDeviceIdentity {
    device_name: String,
    platform: String,
    platform_version: String,
    app_version: String,
    capabilities: Vec<String>,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_local_device_identity])
        .run(tauri::generate_context!())
        .expect("error while running Nohby ONE desktop application");
}
