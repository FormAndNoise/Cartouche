use rusqlite::params;
use std::fs;
use std::path::{Path, PathBuf};

use crate::db::{db_path, init_schema, normalize_project_root, open, read_project, SCHEMA_VERSION};
use crate::error::AppError;
use crate::export::import_project_service;
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
    let norm_root = normalize_project_root(root);
    if norm_root.exists() && !norm_root.is_dir() {
        return Err(AppError::PathNotWritable(norm_root.display().to_string()));
    }
    fs::create_dir_all(&norm_root).map_err(|e| AppError::PathNotWritable(e.to_string()))?;

    let tarot = norm_root.join(".tarot");
    if let Err(e) = fs::create_dir_all(tarot.join("assets"))
        .and_then(|_| fs::create_dir_all(tarot.join("previews")))
    {
        let _ = fs::remove_dir_all(&tarot);
        return Err(AppError::PathNotWritable(e.to_string()));
    }

    let sqlite_path = db_path(&norm_root);
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
        read_project(&conn, &norm_root)
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&tarot);
    }

    result
}

/// Retrieve an existing project by directory path or `.crtch` package file (US-B02, T-04).
pub fn get_project_service(root: &Path) -> Result<Project, AppError> {
    let cleaned = root
        .to_string_lossy()
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string();
    let cleaned_path = PathBuf::from(&cleaned);

    // If the user supplied a `.crtch` or `.zip` bundle path directly, unpack (or open existing unpacked dir)
    if let Some(ext) = cleaned_path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("crtch") || ext.eq_ignore_ascii_case("zip") {
            if !cleaned_path.exists() {
                return Err(AppError::NotFound);
            }
            let stem = cleaned_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("imported_deck");
            let dest_dir = cleaned_path
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(stem);
            if db_path(&dest_dir).exists() {
                let conn = open(&dest_dir)?;
                return read_project(&conn, &dest_dir);
            }
            return import_project_service(&cleaned, &dest_dir.to_string_lossy());
        }
    }

    let norm = normalize_project_root(&cleaned_path);
    if !db_path(&norm).exists() {
        // Check if a sibling `<name>.crtch` or `<name>.zip` exists alongside the requested directory
        let crtch_candidate = PathBuf::from(format!("{}.crtch", norm.to_string_lossy()));
        if crtch_candidate.exists() {
            return import_project_service(
                &crtch_candidate.to_string_lossy(),
                &norm.to_string_lossy(),
            );
        }
        let zip_candidate = PathBuf::from(format!("{}.zip", norm.to_string_lossy()));
        if zip_candidate.exists() {
            return import_project_service(
                &zip_candidate.to_string_lossy(),
                &norm.to_string_lossy(),
            );
        }
    }
    let conn = open(&norm)?;
    read_project(&conn, &norm)
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
    let norm = normalize_project_root(root);
    let conn = open(&norm)?;
    let changed = conn.execute(
        "UPDATE projects SET name = COALESCE(?1, name), grid_columns = COALESCE(?2, grid_columns), metadata_json = COALESCE(?3, metadata_json) WHERE id = 1",
        params![name, grid_columns, metadata_json],
    )?;
    if changed == 0 {
        return Err(AppError::ProjectCorrupt("missing project row".into()));
    }
    read_project(&conn, &norm)
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
