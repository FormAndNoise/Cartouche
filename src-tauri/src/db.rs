use rusqlite::Connection;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::{Project, Socket, Work};

pub const SCHEMA_VERSION: i64 = 1;

/// SQL that creates the initial 6-table schema (T-02, US-B10, US-D02).
const MIGRATION_001_UP: &str = include_str!("../migrations/001_initial_schema.sql");

/// Returns the path to the SQLite database file inside a `.tarot/` project dir.
pub fn db_path(root: &Path) -> PathBuf {
    root.join(".tarot/project.sqlite")
}

/// Open a connection to an existing project database, enabling foreign keys.
pub fn open(root: &Path) -> Result<Connection, AppError> {
    let path = db_path(root);
    if !path.exists() {
        return Err(AppError::NotFound);
    }
    let conn = Connection::open(&path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

/// Initialize the full 6-table schema on a fresh database.
///
/// Uses `CREATE TABLE IF NOT EXISTS` so it is idempotent. Real up/down
/// migrations will be added in a later versioned migration runner; for v1
/// this is the authoritative schema.
pub fn init_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(MIGRATION_001_UP)?;
    let _ = conn.execute(
        "ALTER TABLE projects ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
        [],
    );
    Ok(())
}

pub fn read_works_for_socket(conn: &Connection, socket_id: i64) -> Result<Vec<Work>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT w.id, w.socket_id, w.title, w.media_kind, w.mime_type, w.byte_size, w.asset_hash, 
                p.path, COALESCE(p.state, 'pending'), 
                COALESCE(et.state, 'none'), et.content
         FROM works w
         LEFT JOIN previews p ON p.work_id = w.id
         LEFT JOIN extracted_text et ON et.work_id = w.id
         WHERE w.socket_id = ?1
         ORDER BY w.created_at ASC, w.id ASC",
    )?;

    let works = stmt
        .query_map([socket_id], |r| {
            Ok(Work {
                id: r.get(0)?,
                socket_id: r.get(1)?,
                title: r.get(2)?,
                media_kind: r.get(3)?,
                mime_type: r.get(4)?,
                byte_size: r.get(5)?,
                sha256: r.get(6)?,
                preview_uri: r.get(7)?,
                preview_state: r.get(8)?,
                extracted_text_state: r.get(9)?,
                extracted_text: r.get(10)?,
                metadata_json: "{}".to_string(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(works)
}

/// Read a single socket by ID.
pub fn read_socket(conn: &Connection, id: i64) -> Result<Socket, AppError> {
    let mut socket = conn.query_row(
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
                COALESCE(et.state, 'none'), et.content
         FROM works w
         LEFT JOIN previews p ON p.work_id = w.id
         LEFT JOIN extracted_text et ON et.work_id = w.id
         WHERE w.socket_id IN (SELECT id FROM sockets)
         ORDER BY w.created_at ASC, w.id ASC",
    )?;
    let all_works = works_stmt
        .query_map([], |r| {
            Ok(Work {
                id: r.get(0)?,
                socket_id: r.get(1)?,
                title: r.get(2)?,
                media_kind: r.get(3)?,
                mime_type: r.get(4)?,
                byte_size: r.get(5)?,
                sha256: r.get(6)?,
                preview_uri: r.get(7)?,
                preview_state: r.get(8)?,
                extracted_text_state: r.get(9)?,
                extracted_text: r.get(10)?,
                metadata_json: "{}".to_string(),
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
        path: root.to_path_buf(),
        grid_columns: columns,
        metadata_json,
        sockets,
    })
}
