use rusqlite::params;
use std::collections::HashSet;
use std::path::Path;

use crate::db::{open, read_project, read_socket};
use crate::error::AppError;
use crate::models::{Project, Socket, SocketId};

/// Update title, notes, or metadata of an unlocked socket (US-B03, T-05).
pub fn update_socket_service(
    root: &Path,
    socket_id: i64,
    title: Option<&str>,
    notes: Option<&str>,
    metadata_json: Option<&str>,
) -> Result<Socket, AppError> {
    let conn = open(root)?;
    let current = read_socket(&conn, socket_id)?;

    // Lock policy: editing content fields on a locked socket is forbidden
    if current.locked && (title.is_some() || notes.is_some() || metadata_json.is_some()) {
        return Err(AppError::Locked);
    }

    conn.execute(
        "UPDATE sockets SET title = COALESCE(?1, title), notes = COALESCE(?2, notes), metadata_json = COALESCE(?3, metadata_json) WHERE id = ?4",
        params![title, notes, metadata_json, socket_id],
    )?;

    read_socket(&conn, socket_id)
}

/// Lock or unlock a socket (US-B03, T-05).
pub fn set_socket_lock_service(
    root: &Path,
    socket_id: i64,
    locked: bool,
) -> Result<Socket, AppError> {
    let conn = open(root)?;
    let _ = read_socket(&conn, socket_id)?;

    conn.execute(
        "UPDATE sockets SET locked = ?1 WHERE id = ?2",
        params![if locked { 1 } else { 0 }, socket_id],
    )?;

    read_socket(&conn, socket_id)
}

/// Reorder sockets atomically (US-B03, T-05).
pub fn reorder_sockets_service(
    root: &Path,
    ordered_socket_ids: &[i64],
) -> Result<Project, AppError> {
    // Check for duplicate IDs in the request
    let mut seen = HashSet::new();
    for &id in ordered_socket_ids {
        if !seen.insert(id) {
            return Err(AppError::DuplicateId);
        }
    }

    let conn = open(root)?;

    // Fetch existing socket IDs
    let mut stmt = conn.prepare("SELECT id FROM sockets ORDER BY position")?;
    let existing_ids: Vec<i64> = stmt
        .query_map([], |r| r.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    // Must match the total socket set of the project exactly
    if existing_ids.len() != ordered_socket_ids.len() {
        return Err(AppError::MissingSocket);
    }
    let existing_set: HashSet<i64> = existing_ids.into_iter().collect();
    if seen != existing_set {
        return Err(AppError::MissingSocket);
    }

    let tx = conn.unchecked_transaction()?;
    // Temporary positions to prevent unique constraint violation during reorder
    tx.execute(
        "UPDATE sockets SET position = -1 - id WHERE project_id = 1",
        [],
    )?;
    for (pos, &id) in ordered_socket_ids.iter().enumerate() {
        tx.execute(
            "UPDATE sockets SET position = ?1 WHERE id = ?2",
            params![pos as i64, id],
        )?;
    }
    tx.commit()?;

    read_project(&conn, root)
}

/// Archive / delete a socket (internal mechanism; lock-enforced) (US-B03, T-05).
pub fn archive_socket_service(root: &Path, socket_id: i64) -> Result<(), AppError> {
    let conn = open(root)?;
    let current = read_socket(&conn, socket_id)?;
    if current.locked {
        return Err(AppError::Locked);
    }

    conn.execute("DELETE FROM sockets WHERE id = ?1", [socket_id])?;
    Ok(())
}

/// Select candidate work as winner, or clear winner (US-B03 / US-F07).
pub fn select_winner_service(
    root: &Path,
    socket_id: i64,
    work_id: Option<i64>,
) -> Result<Socket, AppError> {
    let conn = open(root)?;
    let current = read_socket(&conn, socket_id)?;
    if current.locked {
        return Err(AppError::Locked);
    }

    if let Some(wid) = work_id {
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM works WHERE id = ?1 AND socket_id = ?2",
                params![wid, socket_id],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if !exists {
            return Err(AppError::NotFound);
        }
    }

    conn.execute(
        "UPDATE sockets SET selected_work_id = ?1 WHERE id = ?2",
        params![work_id, socket_id],
    )?;

    read_socket(&conn, socket_id)
}

// --- Tauri IPC Commands (T-07 / T-05) ---

#[tauri::command]
pub fn update_socket(
    project_path: String,
    socket_id: SocketId,
    title: Option<String>,
    notes: Option<String>,
    metadata_json: Option<String>,
    metadata: Option<serde_json::Value>,
) -> Result<Socket, AppError> {
    let meta_str = metadata_json.or_else(|| metadata.map(|v| v.to_string()));
    update_socket_service(
        Path::new(&project_path),
        socket_id.0,
        title.as_deref(),
        notes.as_deref(),
        meta_str.as_deref(),
    )
}

#[tauri::command]
pub fn set_socket_lock(
    project_path: String,
    socket_id: SocketId,
    locked: bool,
) -> Result<Socket, AppError> {
    set_socket_lock_service(Path::new(&project_path), socket_id.0, locked)
}

#[tauri::command]
pub fn reorder_sockets(
    project_path: String,
    ordered_socket_ids: Vec<SocketId>,
) -> Result<Project, AppError> {
    let ids: Vec<i64> = ordered_socket_ids.into_iter().map(|s| s.0).collect();
    reorder_sockets_service(Path::new(&project_path), &ids)
}

#[tauri::command]
pub fn archive_socket(project_path: String, socket_id: SocketId) -> Result<(), AppError> {
    archive_socket_service(Path::new(&project_path), socket_id.0)
}

#[tauri::command]
pub fn select_winner(
    project_path: String,
    socket_id: SocketId,
    work_id: Option<SocketId>,
) -> Result<Socket, AppError> {
    select_winner_service(Path::new(&project_path), socket_id.0, work_id.map(|w| w.0))
}
