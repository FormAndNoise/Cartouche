use rusqlite::Connection;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::{Project, Socket};

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
    Ok(())
}

/// Read a single socket by ID.
pub fn read_socket(conn: &Connection, id: i64) -> Result<Socket, AppError> {
    conn.query_row(
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
            })
        },
    )
    .map_err(|_| AppError::SocketNotFound)
}

/// Read a project and its ordered sockets from the database.
pub fn read_project(conn: &Connection, root: &Path) -> Result<Project, AppError> {
    let (name, columns): (String, i64) = conn
        .query_row(
            "SELECT name, grid_columns FROM projects WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| AppError::ProjectCorrupt("missing project row".into()))?;

    let mut stmt = conn.prepare(
        "SELECT id, position, title, notes, metadata_json, locked, selected_work_id FROM sockets ORDER BY position",
    )?;
    let sockets = stmt
        .query_map([], |r| {
            Ok(Socket {
                id: r.get(0)?,
                position: r.get(1)?,
                title: r.get(2)?,
                notes: r.get(3)?,
                metadata_json: r.get(4)?,
                locked: r.get::<_, i64>(5)? != 0,
                selected_work_id: r.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Project {
        name,
        path: root.to_path_buf(),
        grid_columns: columns,
        sockets,
    })
}
