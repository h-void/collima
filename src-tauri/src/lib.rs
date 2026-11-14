use tauri_plugin_dialog::DialogExt;

/// Open a native OS Save File dialog and write UTF-8 report bytes (CSV / JSON) directly to disk.
#[tauri::command]
async fn save_export_file(
    app: tauri::AppHandle,
    default_name: String,
    content: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app.dialog().file().set_file_name(&default_name);
        let lower = default_name.to_ascii_lowercase();
        if lower.ends_with(".csv") {
            builder = builder.add_filter("CSV Calibration Report", &["csv"]);
        } else if lower.ends_with(".json") {
            builder = builder.add_filter("JSON Calibration Data", &["json"]);
        }

        let Some(file_path) = builder.blocking_save_file() else {
            return Ok(false);
        };

        let path = file_path
            .into_path()
            .map_err(|e| format!("无法解析导出路径: {e}"))?;
        std::fs::write(&path, content.as_bytes())
            .map_err(|e| format!("写入文件失败 ({}): {e}", path.display()))?;
        Ok(true)
    })
    .await
    .map_err(|e| format!("导出任务失败: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_export_file])
        .run(tauri::generate_context!())
        .expect("error while running collima desktop application");
}
