use rusqlite::params;
use std::fs;
use std::path::Path;

use crate::db::{db_path, init_schema, open, read_project, SCHEMA_VERSION};
use crate::error::AppError;
use crate::models::Project;

/// Create a new `.tarot` project with fixed socket count (US-B02, T-04).
pub fn create_project_service(
 name: &str,
 socket_count: i64,
 root: &Path,
) -> Result<Project, AppError> {
 if socket_count <= 0 {
 return Err(AppError::InvalidSocketCount);
 }
 if root.exists() && !root.is_dir() {
 return Err(AppError::PathNotWritable(root.display().to_string()));
 }
 fs::create_dir_all(root).map_err(|e| AppError::PathNotWritable(e.to_string()))?;

 let tarot = root.join(".tarot");
 if let Err(e) = fs::create_dir_all(tarot.join("assets"))
 .and_then(|_| fs::create_dir_all(tarot.join("previews")))
 {
 let _ = fs::remove_dir_all(&tarot);
 return Err(AppError::PathNotWritable(e.to_string()));
 }

 let sqlite_path = db_path(root);
 let conn = match rusqlite::Connection::open(&sqlite_path) {
 Ok(c) => c,
 Err(e) => {
 let _ = fs::remove_dir_all(&tarot);
 return Err(e.into());
 }
 };

 let result = (|| -> Result<Project, AppError> {
 conn.pragma_update(None, "foreign_keys", "ON")?;
 init_schema(&conn)?;
 let tx = conn.unchecked_transaction()?;
 tx.execute(
 "INSERT INTO projects (id, name, grid_columns, schema_version) VALUES (1, ?1, 3, ?2)",
 params![name, SCHEMA_VERSION],
 )?;
 for p in 0..socket_count {
 tx.execute(
 "INSERT INTO sockets (project_id, position) VALUES (1, ?1)",
 [p],
 )?;
 }
 tx.commit()?;
 read_project(&conn, root)
 })();

 if result.is_err() {
 let _ = fs::remove_dir_all(&tarot);
 }

 result
}

/// Retrieve an existing project by directory path (US-B02, T-04).
pub fn get_project_service(root: &Path) -> Result<Project, AppError> {
 let conn = open(root)?;
 read_project(&conn, root)
}

/// Update project name, grid columns, and metadata (US-B02, T-04).
pub fn update_project_service(
 root: &Path,
 name: Option<&str>,
 grid_columns: Option<i64>,
 metadata_json: Option<&str>,
) -> Result<Project, AppError> {
 if let Some(columns) = grid_columns {
 if !(1..=4).contains(&columns) {
 return Err(AppError::InvalidGridColumns);
 }
 }
 let conn = open(root)?;
 let changed = conn.execute(
 "UPDATE projects SET name = COALESCE(?1, name), grid_columns = COALESCE(?2, grid_columns), metadata_json = COALESCE(?3, metadata_json) WHERE id = 1",
 params![name, grid_columns, metadata_json],
 )?;
 if changed == 0 {
 return Err(AppError::ProjectCorrupt("missing project row".into()));
 }
 read_project(&conn, root)
}

// --- Tauri IPC Commands (T-06) ---

#[tauri::command]
pub fn create_project(
 name: String,
 socket_count: i64,
 project_path: String,
) -> Result<Project, AppError> {
 create_project_service(&name, socket_count, Path::new(&project_path))
}

#[tauri::command]
pub fn get_project(project_path: String) -> Result<Project, AppError> {
 get_project_service(Path::new(&project_path))
}

#[tauri::command]
pub fn update_project(
 project_path: String,
 name: Option<String>,
 grid_columns: Option<i64>,
 metadata_json: Option<String>,
) -> Result<Project, AppError> {
 update_project_service(
 Path::new(&project_path),
 name.as_deref(),
 grid_columns,
 metadata_json.as_deref(),
 )
}
