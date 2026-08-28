use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

use crate::db::{open, read_socket};
use crate::error::AppError;
use crate::models::{Socket, SocketId, Work};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RejectedFile {
    pub path: String,
    pub reason: String,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportDroppedResult {
    pub accepted: Vec<Work>,
    pub rejected: Vec<RejectedFile>,
}

const TEXT_EXTS: &[&str] = &["txt", "md", "csv", "json", "docx", "pdf"];

fn compute_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

fn media_kind_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "tiff" | "webp" | "svg" => "image",
        "pdf" => "pdf",
        "docx" => "docx",
        "txt" | "md" | "csv" | "json" => "text",
        _ => "other",
    }
}

fn mime_for_ext(ext: &str) -> Option<String> {
    match ext.to_lowercase().as_str() {
        "png" => Some("image/png".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "gif" => Some("image/gif".to_string()),
        "bmp" => Some("image/bmp".to_string()),
        "tiff" => Some("image/tiff".to_string()),
        "webp" => Some("image/webp".to_string()),
        "svg" => Some("image/svg+xml".to_string()),
        "pdf" => Some("application/pdf".to_string()),
        "docx" => Some(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string(),
        ),
        "txt" => Some("text/plain".to_string()),
        "md" => Some("text/markdown".to_string()),
        "csv" => Some("text/csv".to_string()),
        "json" => Some("application/json".to_string()),
        _ => None,
    }
}

pub fn attach_work_data_service(
    root: &Path,
    socket_id: i64,
    filename: &str,
    data: &[u8],
) -> Result<Socket, AppError> {
    let conn = open(root)?;
    let socket = read_socket(&conn, socket_id)?;
    if socket.locked {
        return Err(AppError::Locked);
    }

    let ext = Path::new(filename)
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let media_kind = media_kind_for_ext(&ext);
    let title = Path::new(filename)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let mime_type = mime_for_ext(&ext);
    let byte_size = data.len() as i64;
    let sha256 = compute_sha256(data);

    let assets_dir = root.join(".tarot/assets");
    fs::create_dir_all(&assets_dir)?;
    let asset_filename = format!("{}.{}", sha256, ext);
    let dest_path = assets_dir.join(&asset_filename);
    let dest_rel_path = format!("assets/{}", asset_filename);

    if !dest_path.exists() {
        fs::write(&dest_path, data)?;
    }

    conn.execute(
        "INSERT INTO works (socket_id, title, asset_hash, asset_path, media_kind, mime_type, byte_size) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![socket_id, title, sha256, dest_rel_path, media_kind, mime_type, byte_size],
    )?;

    let work_id = conn.last_insert_rowid();

    let preview_state = if media_kind == "image" {
        "pending"
    } else {
        "failed"
    };
    conn.execute(
        "INSERT INTO previews (work_id, state) VALUES (?1, ?2)",
        params![work_id, preview_state],
    )?;

    if media_kind == "image" {
        if let Err(e) = generate_preview(root, &conn, work_id, &dest_path) {
            conn.execute(
                "UPDATE previews SET state = 'failed', error_message = ?1 WHERE work_id = ?2",
                params![e.to_string(), work_id],
            )?;
        }
    }

    let is_text = TEXT_EXTS.contains(&ext.to_lowercase().as_str());
    let et_state = if is_text { "pending" } else { "unsupported" };
    conn.execute(
        "INSERT INTO extracted_text (work_id, state) VALUES (?1, ?2)",
        params![work_id, et_state],
    )?;

    if is_text {
        match crate::extract::extract_text_from_bytes(data, &ext) {
            Ok(text) => {
                conn.execute(
                    "UPDATE extracted_text SET state = 'ready', content = ?1 WHERE work_id = ?2",
                    params![text, work_id],
                )?;
            }
            Err(e) => {
                conn.execute(
                    "UPDATE extracted_text SET state = 'failed', error_message = ?1 WHERE work_id = ?2",
                    params![e.to_string(), work_id],
                )?;
            }
        }
    }

    read_socket(&conn, socket_id)
}

pub fn attach_work_service(
    root: &Path,
    socket_id: i64,
    source_path: &str,
) -> Result<Socket, AppError> {
    let source = Path::new(source_path);
    let data = fs::read(source).map_err(|e| AppError::FileUnreadable(e.to_string()))?;
    let filename = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    attach_work_data_service(root, socket_id, &filename, &data)
}

pub fn generate_preview(
    root: &Path,
    conn: &Connection,
    work_id: i64,
    asset_abs_path: &Path,
) -> Result<(), AppError> {
    let img = image::open(asset_abs_path).map_err(|e| AppError::Internal(e.to_string()))?;
    let thumbnail = img.thumbnail(400, 400);

    let previews_dir = root.join(".tarot/previews");
    fs::create_dir_all(&previews_dir)?;

    let preview_path = previews_dir.join(format!("{}.png", work_id));
    thumbnail
        .save_with_format(&preview_path, image::ImageFormat::Png)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let path_str = preview_path.to_string_lossy().to_string();
    conn.execute(
        "UPDATE previews SET state = 'ready', path = ?1 WHERE work_id = ?2",
        params![path_str, work_id],
    )?;

    Ok(())
}

pub fn remove_work_service(
    root: &Path,
    socket_id: i64,
    work_id: i64,
    force: bool,
) -> Result<Socket, AppError> {
    let conn = open(root)?;
    let socket = read_socket(&conn, socket_id)?;
    if socket.locked {
        return Err(AppError::Locked);
    }

    let work_row = conn
        .query_row(
            "SELECT asset_hash, asset_path FROM works WHERE id = ?1 AND socket_id = ?2",
            params![work_id, socket_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| AppError::NotFound);

    let (asset_hash, asset_rel_path) = work_row?;

    if socket.selected_work_id == Some(work_id) {
        if !force {
            return Err(AppError::IsSelected);
        }
        conn.execute(
            "UPDATE sockets SET selected_work_id = NULL WHERE id = ?1",
            params![socket_id],
        )?;
    }

    conn.execute("DELETE FROM works WHERE id = ?1", params![work_id])?;

    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM works WHERE asset_hash = ?1",
        params![asset_hash],
        |r| r.get(0),
    )?;

    if count == 0 {
        let asset_abs_path = root.join(".tarot").join(&asset_rel_path);
        let _ = fs::remove_file(asset_abs_path);
    }

    let preview_path = root
        .join(".tarot/previews")
        .join(format!("{}.png", work_id));
    let _ = fs::remove_file(preview_path);

    read_socket(&conn, socket_id)
}

pub fn import_dropped_files_service(
    root: &Path,
    socket_id: i64,
    paths: &[String],
) -> Result<ImportDroppedResult, AppError> {
    let mut accepted = Vec::new();
    let mut rejected = Vec::new();

    for path in paths {
        match attach_work_service(root, socket_id, path) {
            Ok(socket) => {
                if let Some(work) = socket.works.last() {
                    accepted.push(work.clone());
                }
            }
            Err(e) => {
                rejected.push(RejectedFile {
                    path: path.clone(),
                    reason: e.to_string(),
                    code: e.code().to_string(),
                });
            }
        }
    }

    Ok(ImportDroppedResult { accepted, rejected })
}

#[tauri::command]
pub fn attach_work(
    project_path: String,
    socket_id: SocketId,
    source_path: String,
) -> Result<Socket, AppError> {
    attach_work_service(Path::new(&project_path), socket_id.0, &source_path)
}

#[tauri::command]
pub fn remove_work(
    project_path: String,
    socket_id: SocketId,
    work_id: SocketId,
    force: Option<bool>,
) -> Result<Socket, AppError> {
    remove_work_service(
        Path::new(&project_path),
        socket_id.0,
        work_id.0,
        force.unwrap_or(false),
    )
}

#[tauri::command]
pub fn attach_work_bytes(
    project_path: String,
    socket_id: SocketId,
    name: String,
    bytes: Vec<u8>,
) -> Result<Socket, AppError> {
    attach_work_data_service(Path::new(&project_path), socket_id.0, &name, &bytes)
}

#[tauri::command]
pub fn import_dropped_files(
    project_path: String,
    socket_id: SocketId,
    paths: Vec<String>,
) -> Result<ImportDroppedResult, AppError> {
    import_dropped_files_service(Path::new(&project_path), socket_id.0, &paths)
}

pub fn move_work_service(
    root: &Path,
    source_socket_id: i64,
    target_socket_id: i64,
    work_id: i64,
) -> Result<crate::models::Project, AppError> {
    let conn = open(root)?;
    let source_socket = read_socket(&conn, source_socket_id)?;
    if source_socket.locked {
        return Err(AppError::Locked);
    }
    let target_socket = read_socket(&conn, target_socket_id)?;
    if target_socket.locked {
        return Err(AppError::Locked);
    }

    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM works WHERE id = ?1 AND socket_id = ?2",
            params![work_id, source_socket_id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return Err(AppError::NotFound);
    }

    conn.execute(
        "UPDATE works SET socket_id = ?1 WHERE id = ?2",
        params![target_socket_id, work_id],
    )?;

    if source_socket.selected_work_id == Some(work_id) {
        conn.execute(
            "UPDATE sockets SET selected_work_id = NULL WHERE id = ?1",
            params![source_socket_id],
        )?;
    }

    if target_socket.selected_work_id.is_none() {
        conn.execute(
            "UPDATE sockets SET selected_work_id = ?1 WHERE id = ?2",
            params![work_id, target_socket_id],
        )?;
    }

    crate::db::read_project(&conn, root)
}

#[tauri::command]
pub fn move_work(
    project_path: String,
    source_socket_id: SocketId,
    target_socket_id: SocketId,
    work_id: SocketId,
) -> Result<crate::models::Project, AppError> {
    move_work_service(
        Path::new(&project_path),
        source_socket_id.0,
        target_socket_id.0,
        work_id.0,
    )
}

fn current_timestamp_str() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()),
        Err(_) => "0Z".to_string(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalEditorResponse {
    pub path: String,
    pub work_id: i64,
    pub original_sha256: String,
    pub message: String,
}

pub fn open_in_external_editor_service(
    root: &Path,
    socket_id: i64,
    work_id: i64,
) -> Result<ExternalEditorResponse, AppError> {
    let conn = open(root)?;
    let socket = read_socket(&conn, socket_id)?;
    let work = socket
        .works
        .iter()
        .find(|w| w.id == work_id)
        .ok_or(AppError::NotFound)?;

    let asset_rel_path: String = conn
        .query_row(
            "SELECT asset_path FROM works WHERE id = ?1 AND socket_id = ?2",
            params![work_id, socket_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::NotFound)?;

    let abs_path = root.join(".tarot").join(&asset_rel_path);
    if !abs_path.exists() {
        return Err(AppError::NotFound);
    }

    let path_str = abs_path.to_string_lossy().to_string();

    // Record forensic edit open event into metadata_json
    let mut meta: serde_json::Value =
        serde_json::from_str(&socket.metadata_json).unwrap_or(serde_json::json!({}));
    let mut ledger = meta
        .get("provenance_ledger")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let now = current_timestamp_str();
    let entry = serde_json::json!({
        "id": format!("prov-{}", ledger.len() + 1),
        "timestamp": now,
        "event": "EXTERNAL_EDIT_OPENED",
        "work_id": work_id,
        "asset_filename": work.title,
        "sha256_hash": work.sha256,
        "byte_size": work.byte_size,
        "notes": "File opened in external image editor"
    });
    ledger.push(entry);
    meta["provenance_ledger"] = serde_json::Value::Array(ledger);
    let new_meta_json = serde_json::to_string(&meta).unwrap_or(socket.metadata_json);
    conn.execute(
        "UPDATE sockets SET metadata_json = ?1 WHERE id = ?2",
        params![new_meta_json, socket_id],
    )?;

    // Spawn default external editor for the OS
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", &path_str])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path_str).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn();
    }

    Ok(ExternalEditorResponse {
        path: path_str,
        work_id,
        original_sha256: work.sha256.clone(),
        message: "Opened in external editor. Save your changes and click 'Sync External Edits' to commit into the .crtch bundle.".to_string(),
    })
}

#[tauri::command]
pub fn open_in_external_editor(
    project_path: String,
    socket_id: SocketId,
    work_id: SocketId,
) -> Result<ExternalEditorResponse, AppError> {
    open_in_external_editor_service(Path::new(&project_path), socket_id.0, work_id.0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncEditsResponse {
    pub modified: bool,
    pub socket: Socket,
    pub old_sha256: String,
    pub new_sha256: String,
    pub message: String,
}

pub fn sync_external_edits_service(
    root: &Path,
    socket_id: i64,
    work_id: i64,
) -> Result<SyncEditsResponse, AppError> {
    let conn = open(root)?;
    let socket = read_socket(&conn, socket_id)?;
    let work = socket
        .works
        .iter()
        .find(|w| w.id == work_id)
        .ok_or(AppError::NotFound)?;

    let asset_rel_path: String = conn
        .query_row(
            "SELECT asset_path FROM works WHERE id = ?1 AND socket_id = ?2",
            params![work_id, socket_id],
            |r| r.get(0),
        )
        .map_err(|_| AppError::NotFound)?;

    let abs_path = root.join(".tarot").join(&asset_rel_path);
    if !abs_path.exists() {
        return Err(AppError::NotFound);
    }

    let data = fs::read(&abs_path).map_err(|e| AppError::FileUnreadable(e.to_string()))?;
    let new_sha256 = compute_sha256(&data);
    let old_sha256 = work.sha256.clone();
    let new_byte_size = data.len() as i64;

    if new_sha256 != old_sha256 {
        // 1. Update works table
        conn.execute(
            "UPDATE works SET asset_hash = ?1, byte_size = ?2 WHERE id = ?3",
            params![new_sha256, new_byte_size, work_id],
        )?;

        // 2. Regenerate preview thumbnail
        if work.media_kind == "image" {
            let _ = generate_preview(root, &conn, work_id, &abs_path);
        }

        // 3. Append forensic ledger entry with cryptographic SHA-256 state chain
        let mut meta: serde_json::Value =
            serde_json::from_str(&socket.metadata_json).unwrap_or(serde_json::json!({}));
        let mut ledger = meta
            .get("provenance_ledger")
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default();

        let now = current_timestamp_str();
        let entry = serde_json::json!({
            "id": format!("prov-{}", ledger.len() + 1),
            "timestamp": now,
            "event": "EXTERNAL_EDIT_COMMITTED",
            "work_id": work_id,
            "asset_filename": work.title,
            "previous_sha256": old_sha256,
            "sha256_hash": new_sha256,
            "byte_size": new_byte_size,
            "byte_size_delta": new_byte_size - work.byte_size,
            "notes": "External image editor modifications detected and committed to .crtch bundle"
        });
        ledger.push(entry);
        meta["provenance_ledger"] = serde_json::Value::Array(ledger);
        let new_meta_json = serde_json::to_string(&meta).unwrap_or(socket.metadata_json);
        conn.execute(
            "UPDATE sockets SET metadata_json = ?1 WHERE id = ?2",
            params![new_meta_json, socket_id],
        )?;

        let updated_socket = read_socket(&conn, socket_id)?;
        Ok(SyncEditsResponse {
            modified: true,
            socket: updated_socket,
            old_sha256,
            new_sha256,
            message: "External edits successfully synced. Cryptographic SHA-256 hash recorded in forensic ledger.".to_string(),
        })
    } else {
        Ok(SyncEditsResponse {
            modified: false,
            socket,
            old_sha256,
            new_sha256,
            message: "No external file changes detected. Cryptographic hash matches.".to_string(),
        })
    }
}

#[tauri::command]
pub fn sync_external_edits(
    project_path: String,
    socket_id: SocketId,
    work_id: SocketId,
) -> Result<SyncEditsResponse, AppError> {
    sync_external_edits_service(Path::new(&project_path), socket_id.0, work_id.0)
}
