use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::db::{open, read_project, read_socket};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvPreview {
 pub headers: Vec<String>,
 pub rows: Vec<Vec<String>>,
 pub rows_total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportJobResponse {
 pub job_id: String,
 pub rows_total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportWarning {
 pub row: usize,
 pub reason: String,
 pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
 pub rows_total: usize,
 pub rows_processed: usize,
 pub rows_skipped: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStatus {
 pub state: String,
 pub progress: usize,
 pub warnings: Vec<ImportWarning>,
 #[serde(skip_serializing_if = "Option::is_none")]
 pub result: Option<ImportResult>,
}

pub fn parse_status_value(input: &str) -> Option<&'static str> {
 let clean: String = input
 .trim()
 .to_lowercase()
 .chars()
 .filter(|c| c.is_alphanumeric())
 .collect();

 match clean.as_str() {
 "notstarted" | "todo" | "backlog" | "queued" | "unstarted" | "open" | "draft" | "new"
 | "pending" | "0" | "" => Some("not_started"),
 "inprogress" | "wip" | "doing" | "working" | "started" | "active" | "development" | "1" => {
 Some("in_progress")
 }
 "needsreview" | "review" | "inreview" | "underreview" | "feedback" | "qa" | "audit"
 | "check" | "testing" | "2" => Some("needs_review"),
 "done" | "complete" | "completed" | "finished" | "ready" | "shipped" | "final"
 | "closed" | "passed" | "3" => Some("done"),
 _ => None,
 }
}

/// Parses CSV text into a vector of rows, where each row is a vector of cells.
/// Supports quotes, escaped double quotes (""), and multiline/CRLF.
pub fn parse_csv(text: &str) -> Vec<Vec<String>> {
 let mut rows: Vec<Vec<String>> = Vec::new();
 let mut current_row: Vec<String> = Vec::new();
 let mut current_field = String::new();
 let mut in_quotes = false;
 let chars: Vec<char> = text.chars().collect();
 let len = chars.len();
 let mut i = 0;

 while i < len {
 let ch = chars[i];
 if in_quotes {
 if ch == '"' {
 if i + 1 < len && chars[i + 1] == '"' {
 current_field.push('"');
 i += 1;
 } else {
 in_quotes = false;
 }
 } else {
 current_field.push(ch);
 }
 } else if ch == '"' {
 in_quotes = true;
 } else if ch == ',' {
 current_row.push(current_field);
 current_field = String::new();
 } else if ch == '\n' || ch == '\r' {
 if ch == '\r' && i + 1 < len && chars[i + 1] == '\n' {
 i += 1;
 }
 current_row.push(current_field);
 current_field = String::new();
 rows.push(current_row);
 current_row = Vec::new();
 } else {
 current_field.push(ch);
 }
 i += 1;
 }

 if !current_field.is_empty() || !current_row.is_empty() {
 current_row.push(current_field);
 rows.push(current_row);
 }

 // Filter out rows that only contain empty strings
 rows.into_iter()
 .filter(|r| r.iter().any(|c| !c.trim().is_empty()))
 .collect()
}

pub fn parse_import_csv(csv_text: &str) -> Result<(Vec<String>, Vec<Vec<String>>), AppError> {
 let table = parse_csv(csv_text);
 if table.is_empty() {
 return Err(AppError::ValidationError("CSV file is empty".to_string()));
 }

 let headers: Vec<String> = table[0].iter().map(|h| h.trim().to_lowercase()).collect();

 if !headers.contains(&"title".to_string()) {
 return Err(AppError::MissingRequiredColumn(
 "CSV must contain a 'title' column".to_string(),
 ));
 }

 let rows = table[1..].to_vec();
 Ok((headers, rows))
}

pub fn preview_csv_service(root: &Path, csv_text: &str) -> Result<CsvPreview, AppError> {
 let _ = open(root)?;
 let (headers, rows) = parse_import_csv(csv_text)?;
 let sample = rows.iter().take(5).cloned().collect();
 Ok(CsvPreview {
 headers,
 rows: sample,
 rows_total: rows.len(),
 })
}

pub fn import_csv_service(
 root: &Path,
 csv_text: &str,
 mode: &str,
) -> Result<ImportJobResponse, AppError> {
 let mut conn = open(root)?;
 let (headers, rows) = parse_import_csv(csv_text)?;

 conn.execute(
 "INSERT INTO import_jobs (state, progress, warnings_json) VALUES ('running', 0, '[]')",
 [],
 )?;
 let job_id = conn.last_insert_rowid();

 let title_idx = headers.iter().position(|h| h == "title");
 let notes_idx = headers.iter().position(|h| h == "notes");
 let status_idx = headers.iter().position(|h| h == "status");
 let medium_idx = headers.iter().position(|h| h == "medium");
 let tags_idx = headers.iter().position(|h| h == "tags");
 let due_idx = headers.iter().position(|h| h == "due_date");

 let mut project = read_project(&conn, root)?;
 let mut warnings: Vec<ImportWarning> = Vec::new();
 let mut processed = 0;
 let mut skipped = 0;
 let mut cursor = 0;

 let tx = conn.transaction()?;

 for (row_idx, row) in rows.iter().enumerate() {
 let row_num = row_idx + 1;

 let (socket_id, target_pos) = if mode == "update" {
 if row_idx < project.sockets.len() {
 let s = &project.sockets[row_idx];
 if s.locked {
 warnings.push(ImportWarning {
 row: row_num,
 reason: "Socket is locked".to_string(),
 code: "LOCKED".to_string(),
 });
 skipped += 1;
 continue;
 }
 (s.id, Some(row_idx))
 } else {
 // Dynamically expand socket count to match CSV
 let new_pos = project.sockets.len() as i64;
 tx.execute(
 "INSERT INTO sockets (project_id, position) VALUES (1, ?1)",
 params![new_pos],
 )?;
 let new_id = tx.last_insert_rowid();
 project.sockets.push(crate::models::Socket {
 id: new_id,
 position: new_pos,
 title: String::new(),
 notes: String::new(),
 metadata_json: "{}".to_string(),
 locked: false,
 selected_work_id: None,
 works: Vec::new(),
 });
 (new_id, Some(row_idx))
 }
 } else {
 // append mode: find next empty socket or allocate new socket
 while cursor < project.sockets.len()
 && (!project.sockets[cursor].title.trim().is_empty()
 || project.sockets[cursor].locked)
 {
 if project.sockets[cursor].locked {
 warnings.push(ImportWarning {
 row: row_num,
 reason: "Socket is locked".to_string(),
 code: "LOCKED".to_string(),
 });
 }
 cursor += 1;
 }

 if cursor < project.sockets.len() {
 (project.sockets[cursor].id, Some(cursor))
 } else {
 // Dynamically expand socket count for append
 let new_pos = project.sockets.len() as i64;
 tx.execute(
 "INSERT INTO sockets (project_id, position) VALUES (1, ?1)",
 params![new_pos],
 )?;
 let new_id = tx.last_insert_rowid();
 project.sockets.push(crate::models::Socket {
 id: new_id,
 position: new_pos,
 title: String::new(),
 notes: String::new(),
 metadata_json: "{}".to_string(),
 locked: false,
 selected_work_id: None,
 works: Vec::new(),
 });
 cursor = project.sockets.len() - 1;
 (new_id, Some(cursor))
 }
 };

 let title_val = title_idx
 .and_then(|idx| row.get(idx))
 .map(|s| s.trim())
 .unwrap_or("");
 if title_val.is_empty() {
 warnings.push(ImportWarning {
 row: row_num,
 reason: "Empty title".to_string(),
 code: "ROW_VALIDATION_ERROR".to_string(),
 });
 skipped += 1;
 continue;
 }

 let existing_socket = read_socket(&tx, socket_id)?;
 let mut meta: serde_json::Value = serde_json::from_str(&existing_socket.metadata_json)
 .unwrap_or_else(|_| {
 serde_json::json!({
 "status": "not_started",
 "medium": "",
 "tags": "",
 "due_date": serde_json::Value::Null
 })
 });

 if let Some(s_idx) = status_idx {
 if let Some(v) = row.get(s_idx).map(|s| s.trim()) {
 if !v.is_empty() {
 if let Some(canonical) = parse_status_value(v) {
 meta["status"] = serde_json::Value::String(canonical.to_string());
 } else {
 warnings.push(ImportWarning {
 row: row_num,
 reason: format!("Invalid status '{}' — row skipped", v),
 code: "ROW_VALIDATION_ERROR".to_string(),
 });
 skipped += 1;
 continue;
 }
 }
 }
 }

 if let Some(m_idx) = medium_idx {
 if let Some(v) = row.get(m_idx).map(|s| s.trim()) {
 meta["medium"] = serde_json::Value::String(v.to_string());
 }
 }

 if let Some(t_idx) = tags_idx {
 if let Some(v) = row.get(t_idx).map(|s| s.trim()) {
 meta["tags"] = serde_json::Value::String(v.to_string());
 }
 }

 if let Some(d_idx) = due_idx {
 if let Some(v) = row.get(d_idx).map(|s| s.trim()) {
 if v.is_empty() {
 meta["due_date"] = serde_json::Value::Null;
 } else {
 meta["due_date"] = serde_json::Value::String(v.to_string());
 }
 }
 }

 let author_idx = headers
 .iter()
 .position(|h| h == "author" || h == "author_override");
 if let Some(a_idx) = author_idx {
 if let Some(v) = row.get(a_idx).map(|s| s.trim()) {
 if !v.is_empty() {
 meta["author_override"] = serde_json::Value::String(v.to_string());
 }
 }
 }

 let license_idx = headers
 .iter()
 .position(|h| h == "license" || h == "license_override");
 if let Some(l_idx) = license_idx {
 if let Some(v) = row.get(l_idx).map(|s| s.trim()) {
 if !v.is_empty() {
 meta["license_override"] = serde_json::Value::String(v.to_string());
 }
 }
 }

 let notes_val = notes_idx
 .and_then(|idx| row.get(idx))
 .map(|s| s.trim())
 .unwrap_or(&existing_socket.notes);
 let meta_json_str = meta.to_string();

 tx.execute(
 "UPDATE sockets SET title = ?1, notes = ?2, metadata_json = ?3 WHERE id = ?4",
 params![title_val, notes_val, meta_json_str, socket_id],
 )?;

 if let Some(pos) = target_pos {
 project.sockets[pos].title = title_val.to_string();
 project.sockets[pos].notes = notes_val.to_string();
 project.sockets[pos].metadata_json = meta_json_str;
 }

 if mode == "append" {
 cursor += 1;
 }
 processed += 1;
 }

 let warnings_json = serde_json::to_string(&warnings).unwrap_or_else(|_| "[]".to_string());
 let result_json = serde_json::to_string(&ImportResult {
 rows_total: rows.len(),
 rows_processed: processed,
 rows_skipped: skipped,
 })
 .unwrap_or_default();

 tx.execute(
 "UPDATE import_jobs SET state = 'done', progress = 100, warnings_json = ?1, result_json = ?2 WHERE id = ?3",
 params![warnings_json, result_json, job_id],
 )?;

 tx.commit()?;

 Ok(ImportJobResponse {
 job_id: job_id.to_string(),
 rows_total: rows.len(),
 })
}

fn escape_csv_field(s: &str) -> String {
 if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
 format!("\"{}\"", s.replace('"', "\"\""))
 } else {
 s.to_string()
 }
}

pub fn export_csv_service(root: &Path) -> Result<String, AppError> {
 let conn = open(root)?;
 let project = read_project(&conn, root)?;

 let mut out = String::from("title,status,medium,tags,due_date,author,license,notes\n");
 for s in &project.sockets {
 let title = escape_csv_field(&s.title);
 let notes = escape_csv_field(&s.notes);
 let meta: serde_json::Value = serde_json::from_str(&s.metadata_json).unwrap_or_default();
 let status = escape_csv_field(
 meta.get("status")
 .and_then(|v| v.as_str())
 .unwrap_or("not_started"),
 );
 let medium = escape_csv_field(meta.get("medium").and_then(|v| v.as_str()).unwrap_or(""));
 let tags = escape_csv_field(meta.get("tags").and_then(|v| v.as_str()).unwrap_or(""));
 let due_date =
 escape_csv_field(meta.get("due_date").and_then(|v| v.as_str()).unwrap_or(""));
 let author = escape_csv_field(
 meta.get("author_override")
 .and_then(|v| v.as_str())
 .unwrap_or(""),
 );
 let license = escape_csv_field(
 meta.get("license_override")
 .and_then(|v| v.as_str())
 .unwrap_or(""),
 );

 out.push_str(&format!(
 "{},{},{},{},{},{},{},{}\n",
 title, status, medium, tags, due_date, author, license, notes
 ));
 }

 Ok(out)
}

pub fn get_job_service(root: &Path, job_id_str: &str) -> Result<JobStatus, AppError> {
 let conn = open(root)?;
 let job_id: i64 = job_id_str.parse().map_err(|_| AppError::NotFound)?;

 let mut stmt = conn.prepare(
 "SELECT state, progress, warnings_json, result_json FROM import_jobs WHERE id = ?1",
 )?;
 let mut rows = stmt.query([job_id])?;

 if let Some(row) = rows.next()? {
 let state: String = row.get(0)?;
 let progress: i64 = row.get(1)?;
 let warnings_json: String = row.get(2)?;
 let result_json: Option<String> = row.get(3)?;

 let warnings: Vec<ImportWarning> = serde_json::from_str(&warnings_json).unwrap_or_default();
 let result: Option<ImportResult> = result_json.and_then(|s| serde_json::from_str(&s).ok());

 Ok(JobStatus {
 state,
 progress: progress as usize,
 warnings,
 result,
 })
 } else {
 Err(AppError::NotFound)
 }
}

#[tauri::command]
pub fn preview_csv(project_path: String, csv_text: String) -> Result<CsvPreview, AppError> {
 preview_csv_service(Path::new(&project_path), &csv_text)
}

#[tauri::command]
pub fn import_csv(
 project_path: String,
 csv_text: String,
 mode: String,
) -> Result<ImportJobResponse, AppError> {
 import_csv_service(Path::new(&project_path), &csv_text, &mode)
}

#[tauri::command]
pub fn export_csv(project_path: String) -> Result<String, AppError> {
 export_csv_service(Path::new(&project_path))
}

#[tauri::command]
pub fn get_job(project_path: String, job_id: String) -> Result<JobStatus, AppError> {
 get_job_service(Path::new(&project_path), &job_id)
}
