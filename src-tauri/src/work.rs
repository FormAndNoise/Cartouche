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

pub fn attach_work_service(
    root: &Path,
    socket_id: i64,
    source_path: &str,
) -> Result<Socket, AppError> {
    let conn = open(root)?;
    let socket = read_socket(&conn, socket_id)?;
    if socket.locked {
        return Err(AppError::Locked);
    }

    let source = Path::new(source_path);
    let data = fs::read(source).map_err(|e| AppError::FileUnreadable(e.to_string()))?;

    let ext = source
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let media_kind = media_kind_for_ext(&ext);
    let title = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let mime_type = mime_for_ext(&ext);
    let byte_size = data.len() as i64;
    let sha256 = compute_sha256(&data);

    let assets_dir = root.join(".tarot/assets");
    fs::create_dir_all(&assets_dir)?;
    let asset_filename = format!("{}.{}", sha256, ext);
    let dest_path = assets_dir.join(&asset_filename);
    let dest_rel_path = format!("assets/{}", asset_filename);

    if !dest_path.exists() {
        fs::write(&dest_path, &data)?;
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
        match crate::extract::extract_text_from_bytes(&data, &ext) {
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
pub fn import_dropped_files(
    project_path: String,
    socket_id: SocketId,
    paths: Vec<String>,
) -> Result<ImportDroppedResult, AppError> {
    import_dropped_files_service(Path::new(&project_path), socket_id.0, &paths)
}
