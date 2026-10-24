use rusqlite::Connection;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::{Project, Socket, Work};

pub const SCHEMA_VERSION: i64 = 1;

/// SQL that creates the initial 6-table schema (T-02, US-B10, US-D02).
const MIGRATION_001_UP: &str = include_str!("../migrations/001_initial_schema.sql");

/// Normalize a user-supplied project path so selecting `my-deck`, `my-deck/.tarot`,
/// `my-deck/.tarot/project.sqlite`, or a quoted Windows path all resolve to `my-deck`.
pub fn normalize_project_root(root: &Path) -> PathBuf {
    let cleaned_str = root
        .to_string_lossy()
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string();
    let p = PathBuf::from(cleaned_str);

    if p.file_name()
        .map(|n| n.eq_ignore_ascii_case("project.sqlite"))
        .unwrap_or(false)
    {
        if let Some(parent) = p.parent() {
            if parent
                .file_name()
                .map(|n| n.eq_ignore_ascii_case(".tarot"))
                .unwrap_or(false)
            {
                if let Some(grandparent) = parent.parent() {
                    return grandparent.to_path_buf();
                }
            }
            return parent.to_path_buf();
        }
    }

    if p.file_name()
        .map(|n| n.eq_ignore_ascii_case(".tarot"))
        .unwrap_or(false)
        && p.join("project.sqlite").exists()
    {
        if let Some(parent) = p.parent() {
            return parent.to_path_buf();
        }
    }

    p
}

/// Returns the path to the SQLite database file inside a `.tarot/` project dir.
pub fn db_path(root: &Path) -> PathBuf {
    let norm = normalize_project_root(root);
    let standard = norm.join(".tarot/project.sqlite");
    if standard.exists() {
        return standard;
    }
    let direct = norm.join("project.sqlite");
    if direct.exists() {
        return direct;
    }
    standard
}

/// Open a connection to an existing project database, enabling foreign keys
/// and running idempotent column upgrades for older project bundles.
pub fn open(root: &Path) -> Result<Connection, AppError> {
    let path = db_path(root);
    if !path.exists() {
        return Err(AppError::NotFound);
    }
    let conn = Connection::open(&path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let _ = conn.execute(
        "ALTER TABLE projects ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE works ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
        [],
    );
    Ok(conn)
}

/// Initialize the full 6-table schema on a fresh database.
///
/// Uses `CREATE TABLE IF NOT EXISTS` so it is idempotent.
pub fn init_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(MIGRATION_001_UP)?;
    let _ = conn.execute(
        "ALTER TABLE projects ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE works ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
        [],
    );
    Ok(())
}

/// Resolve a work's preview URI so projects that were moved or renamed on disk
/// still resolve their `.tarot/previews/<work_id>.png` or `.tarot/<asset_path>` cleanly.
fn resolve_preview_path(
    root: Option<&Path>,
    work_id: i64,
    stored_preview: Option<String>,
    asset_rel_path: &str,
) -> Option<String> {
    if let Some(ref p_str) = stored_preview {
        let p = Path::new(p_str);
        if p.is_absolute() && p.exists() {
            return Some(p_str.clone());
        }
    }
    if let Some(r) = root {
        let norm = normalize_project_root(r);
        let candidate_png = norm.join(".tarot/previews").join(format!("{}.png", work_id));
        if candidate_png.exists() {
            return Some(candidate_png.to_string_lossy().to_string());
        }
        let candidate_webp = norm
            .join(".tarot/previews")
            .join(format!("{}.webp", work_id));
        if candidate_webp.exists() {
            return Some(candidate_webp.to_string_lossy().to_string());
        }
        if !asset_rel_path.is_empty() {
            let asset_candidate = norm.join(".tarot").join(asset_rel_path);
            if asset_candidate.exists() {
                return Some(asset_candidate.to_string_lossy().to_string());
            }
        }
    }
    stored_preview
}

pub fn read_works_for_socket(conn: &Connection, socket_id: i64) -> Result<Vec<Work>, AppError> {
    read_works_for_socket_with_root(conn, socket_id, None)
}

pub fn read_works_for_socket_with_root(
    conn: &Connection,
    socket_id: i64,
    root: Option<&Path>,
) -> Result<Vec<Work>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT w.id, w.socket_id, w.title, w.media_kind, w.mime_type, w.byte_size, w.asset_hash, 
                p.path, COALESCE(p.state, 'pending'), 
                COALESCE(et.state, 'none'), et.content,
                COALESCE(w.metadata_json, '{}'), w.asset_path
         FROM works w
         LEFT JOIN previews p ON p.work_id = w.id
         LEFT JOIN extracted_text et ON et.work_id = w.id
         WHERE w.socket_id = ?1
         ORDER BY w.created_at ASC, w.id ASC",
    )?;

    let works = stmt
        .query_map([socket_id], |r| {
            let work_id: i64 = r.get(0)?;
            let raw_preview: Option<String> = r.get(7)?;
            let asset_rel: String = r.get(12)?;
            let resolved_preview = resolve_preview_path(root, work_id, raw_preview, &asset_rel);
            Ok(Work {
                id: work_id,
                socket_id: r.get(1)?,
                title: r.get(2)?,
                media_kind: r.get(3)?,
                mime_type: r.get(4)?,
                byte_size: r.get(5)?,
                sha256: r.get(6)?,
                preview_uri: resolved_preview,
                preview_state: r.get(8)?,
                extracted_text_state: r.get(9)?,
                extracted_text: r.get(10)?,
                metadata_json: r.get(11)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(works)
}

/// Read a single socket by ID.
pub fn read_socket(conn: &Connection, id: i64) -> Result<Socket, AppError> {
    let mut socket = conn
        .query_row(
            "SELECT id, position, title, notes, metadata_json, locked, selected_work_id FROM sockets WHERE id = ?1",
            [id],
            |r| {
                Ok(Socket {
                    id: r.get(0)?,
                    position: r.get(1)?,
                    title: r.get(2)?,
                    notes: r.get(3)?,
                    metadata_json: r.get(4)?,
                    locked: r.get::<_, i64>(5)? != 0,
                    selected_work_id: r.get(6)?,
                    works: vec![],
                })
            },
        )
        .map_err(|_| AppError::SocketNotFound)?;

    socket.works = read_works_for_socket(conn, id)?;

    Ok(socket)
}

/// Read a project and its ordered sockets from the database.
pub fn read_project(conn: &Connection, root: &Path) -> Result<Project, AppError> {
    let norm_root = normalize_project_root(root);
    let (name, columns, metadata_json): (String, i64, String) = conn
        .query_row(
            "SELECT name, grid_columns, COALESCE(metadata_json, '{}') FROM projects WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| AppError::ProjectCorrupt("missing project row".into()))?;

    let mut stmt = conn.prepare(
        "SELECT id, position, title, notes, metadata_json, locked, selected_work_id FROM sockets ORDER BY position",
    )?;
    let mut sockets = stmt
        .query_map([], |r| {
            Ok(Socket {
                id: r.get(0)?,
                position: r.get(1)?,
                title: r.get(2)?,
                notes: r.get(3)?,
                metadata_json: r.get(4)?,
                locked: r.get::<_, i64>(5)? != 0,
                selected_work_id: r.get(6)?,
                works: vec![],
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut works_stmt = conn.prepare(
        "SELECT w.id, w.socket_id, w.title, w.media_kind, w.mime_type, w.byte_size, w.asset_hash, 
                p.path, COALESCE(p.state, 'pending'), 
                COALESCE(et.state, 'none'), et.content,
                COALESCE(w.metadata_json, '{}'), w.asset_path
         FROM works w
         LEFT JOIN previews p ON p.work_id = w.id
         LEFT JOIN extracted_text et ON et.work_id = w.id
         WHERE w.socket_id IN (SELECT id FROM sockets)
         ORDER BY w.created_at ASC, w.id ASC",
    )?;
    let all_works = works_stmt
        .query_map([], |r| {
            let work_id: i64 = r.get(0)?;
            let raw_preview: Option<String> = r.get(7)?;
            let asset_rel: String = r.get(12)?;
            let resolved_preview =
                resolve_preview_path(Some(&norm_root), work_id, raw_preview, &asset_rel);
            Ok(Work {
                id: work_id,
                socket_id: r.get(1)?,
                title: r.get(2)?,
                media_kind: r.get(3)?,
                mime_type: r.get(4)?,
                byte_size: r.get(5)?,
                sha256: r.get(6)?,
                preview_uri: resolved_preview,
                preview_state: r.get(8)?,
                extracted_text_state: r.get(9)?,
                extracted_text: r.get(10)?,
                metadata_json: r.get(11)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    for socket in &mut sockets {
        socket.works = all_works
            .iter()
            .filter(|w| w.socket_id == socket.id)
            .cloned()
            .collect();
    }

    Ok(Project {
        name,
        path: norm_root,
        grid_columns: columns,
        metadata_json,
        sockets,
    })
}
