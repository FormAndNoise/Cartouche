use rusqlite::params;
use std::fs;
use std::io::Read;
use std::path::Path;

use crate::db::{open, read_socket};
use crate::error::AppError;
use crate::models::{Socket, SocketId};

const TEXT_WHITELIST: &[&str] = &["txt", "md", "csv", "json", "pdf", "docx"];

pub fn extract_text_from_bytes(data: &[u8], ext: &str) -> Result<String, AppError> {
    match ext.to_lowercase().as_str() {
        "txt" | "md" | "csv" | "json" => Ok(String::from_utf8_lossy(data).to_string()),
        "docx" => extract_text_from_docx_bytes(data),
        "pdf" => extract_text_from_pdf_bytes(data),
        _ => Err(AppError::UnsupportedFormat),
    }
}

fn extract_text_from_docx_bytes(data: &[u8]) -> Result<String, AppError> {
    let reader = std::io::Cursor::new(data);
    let mut zip =
        zip::ZipArchive::new(reader).map_err(|e| AppError::FileUnreadable(e.to_string()))?;

    let mut doc_xml = zip
        .by_name("word/document.xml")
        .map_err(|e| AppError::FileUnreadable(e.to_string()))?;
    let mut xml_content = String::new();
    doc_xml
        .read_to_string(&mut xml_content)
        .map_err(|e| AppError::FileUnreadable(e.to_string()))?;

    // Parse text between <w:t> and </w:t> tags and add newlines for <w:p>
    let mut text = String::new();
    let mut in_tag = false;
    let mut tag_name = String::new();
    let mut in_t = false;

    for ch in xml_content.chars() {
        if ch == '<' {
            in_tag = true;
            tag_name.clear();
        } else if ch == '>' {
            in_tag = false;
            if tag_name.starts_with("w:p ") || tag_name == "w:p" || tag_name == "/w:p" {
                if tag_name == "/w:p" {
                    text.push('\n');
                }
            } else if tag_name == "w:t" || tag_name.starts_with("w:t ") {
                in_t = true;
            } else if tag_name == "/w:t" {
                in_t = false;
            } else if tag_name == "w:tab" || tag_name.starts_with("w:tab ") {
                text.push('\t');
            } else if tag_name == "w:br" || tag_name.starts_with("w:br ") {
                text.push('\n');
            }
        } else if in_tag {
            tag_name.push(ch);
        } else if in_t {
            text.push(ch);
        }
    }

    Ok(text.trim().to_string())
}

fn extract_text_from_pdf_bytes(data: &[u8]) -> Result<String, AppError> {
    if !data.starts_with(b"%PDF-") {
        return Err(AppError::FileUnreadable("Invalid PDF header".to_string()));
    }

    // Simple text stream extraction for plain/uncompressed PDF text objects
    let content = String::from_utf8_lossy(data);
    let mut text_parts = Vec::new();

    // Look for text in parens inside PDF streams e.g. (Some text) Tj or [(Some) (text)] TJ
    let mut in_paren = false;
    let mut current_paren = String::new();
    let mut escaped = false;

    for ch in content.chars() {
        if in_paren {
            if escaped {
                current_paren.push(ch);
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == ')' {
                in_paren = false;
                let trimmed = current_paren.trim();
                if !trimmed.is_empty() && trimmed.chars().any(|c| c.is_alphabetic()) {
                    text_parts.push(trimmed.to_string());
                }
                current_paren.clear();
            } else {
                current_paren.push(ch);
            }
        } else if ch == '(' {
            in_paren = true;
        }
    }

    if text_parts.is_empty() {
        Ok("[PDF document attached — binary preview]".to_string())
    } else {
        Ok(text_parts.join(" "))
    }
}

pub fn extract_text_service(root: &Path, socket_id: i64, work_id: i64) -> Result<Socket, AppError> {
    let conn = open(root)?;
    let _socket = read_socket(&conn, socket_id)?;

    let work_row = conn
        .query_row(
            "SELECT title, asset_path FROM works WHERE id = ?1 AND socket_id = ?2",
            params![work_id, socket_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|_| AppError::NotFound)?;

    let (title, asset_rel_path) = work_row;
    let ext = Path::new(&title)
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
        .to_lowercase();

    if !TEXT_WHITELIST.contains(&ext.as_str()) {
        conn.execute(
            "UPDATE extracted_text SET state = 'unsupported' WHERE work_id = ?1",
            params![work_id],
        )?;
        return Err(AppError::UnsupportedFormat);
    }

    let asset_abs_path = root.join(".tarot").join(&asset_rel_path);
    if !asset_abs_path.exists() {
        conn.execute(
            "UPDATE extracted_text SET state = 'failed', error_message = 'Asset file missing' WHERE work_id = ?1",
            params![work_id],
        )?;
        return Err(AppError::AssetMissing(asset_rel_path));
    }

    let data = fs::read(&asset_abs_path).map_err(|e| AppError::FileUnreadable(e.to_string()))?;
    match extract_text_from_bytes(&data, &ext) {
        Ok(text) => {
            conn.execute(
                "UPDATE extracted_text SET state = 'ready', content = ?1, error_message = NULL WHERE work_id = ?2",
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

    read_socket(&conn, socket_id)
}

#[tauri::command]
pub fn extract_text(
    project_path: String,
    socket_id: SocketId,
    work_id: SocketId,
) -> Result<Socket, AppError> {
    extract_text_service(Path::new(&project_path), socket_id.0, work_id.0)
}
