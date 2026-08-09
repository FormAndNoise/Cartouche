// Library entry — used by Tauri. The app's main.rs re-exports `run`.
//
// Scaffold phase: registers a single `app_version` command and the dialog
// plugin so the frontend IPC smoke test (US-B01 / AC-B01.1) resolves. All
// other commands land in their own feature tickets (US-B02+).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Returns the app version (CARGO_PKG_VERSION) to the frontend.
///
/// Smoke-test command: proves the IPC bridge is wired end to end.
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unit smoke test: the command returns the compile-time package version.
    /// Mirrors what the frontend receives after `invoke("app_version")`.
    #[test]
    fn app_version_returns_crate_version() {
        let v = app_version();
        assert_eq!(v, env!("CARGO_PKG_VERSION"));
        assert!(!v.is_empty(), "version string must not be empty");
    }
}
