// Library entry — used by Tauri. The app's main.rs re-exports `run`.

mod db;
mod error;
mod models;
mod project;
mod socket;

pub use error::AppError;
pub use models::{Project, Socket, SocketId};
pub use project::{create_project, get_project, update_project};
pub use socket::{archive_socket, reorder_sockets, select_winner, set_socket_lock, update_socket};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_version,
            create_project,
            get_project,
            update_project,
            update_socket,
            set_socket_lock,
            reorder_sockets,
            archive_socket,
            select_winner
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Returns the app version (CARGO_PKG_VERSION) to the frontend.
///
/// Smoke-test command: proves the IPC bridge is wired end to end.
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unit smoke test: the command returns the compile-time package version.
    #[test]
    fn app_version_returns_crate_version() {
        let v = app_version();
        assert_eq!(v, env!("CARGO_PKG_VERSION"));
        assert!(!v.is_empty(), "version string must not be empty");
    }

    mod schema_tests {
        use crate::db::{init_schema, SCHEMA_VERSION};
        use rusqlite::Connection;

        #[test]
        fn schema_creates_all_six_tables() {
            let conn = Connection::open_in_memory().unwrap();
            init_schema(&conn).unwrap();

            let tables: Vec<String> = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .unwrap()
                .query_map([], |r| r.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();

            assert!(
                tables.contains(&"projects".into()),
                "missing projects table"
            );
            assert!(tables.contains(&"sockets".into()), "missing sockets table");
            assert!(tables.contains(&"works".into()), "missing works table");
            assert!(
                tables.contains(&"previews".into()),
                "missing previews table"
            );
            assert!(
                tables.contains(&"extracted_text".into()),
                "missing extracted_text table"
            );
            assert!(
                tables.contains(&"import_jobs".into()),
                "missing import_jobs table"
            );
        }

        #[test]
        fn schema_is_idempotent() {
            let conn = Connection::open_in_memory().unwrap();
            init_schema(&conn).unwrap();
            init_schema(&conn).unwrap();
        }

        #[test]
        fn wal_mode_is_enabled() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("test.sqlite");
            let conn = Connection::open(&path).unwrap();
            init_schema(&conn).unwrap();
            let journal: String = conn
                .pragma_query_value(None, "journal_mode", |r| r.get(0))
                .unwrap();
            assert_eq!(journal.to_lowercase(), "wal");
        }

        #[test]
        fn grid_columns_check_constraint() {
            let conn = Connection::open_in_memory().unwrap();
            init_schema(&conn).unwrap();
            conn.execute(
                "INSERT INTO projects (id, name, grid_columns, schema_version) VALUES (1, 'test', 3, ?1)",
                [SCHEMA_VERSION],
            )
            .unwrap();

            let err = conn
                .execute("UPDATE projects SET grid_columns = 5 WHERE id = 1", [])
                .unwrap_err();
            assert!(
                err.to_string().to_lowercase().contains("check"),
                "expected CHECK constraint violation, got: {err}"
            );
        }

        #[test]
        fn socket_position_unique_constraint() {
            let conn = Connection::open_in_memory().unwrap();
            init_schema(&conn).unwrap();
            conn.execute(
                "INSERT INTO projects (id, name, grid_columns, schema_version) VALUES (1, 'test', 3, ?1)",
                [SCHEMA_VERSION],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO sockets (project_id, position) VALUES (1, 0)",
                [],
            )
            .unwrap();
            let err = conn
                .execute(
                    "INSERT INTO sockets (project_id, position) VALUES (1, 0)",
                    [],
                )
                .unwrap_err();
            assert!(
                err.to_string().to_lowercase().contains("unique"),
                "expected UNIQUE constraint violation, got: {err}"
            );
        }
    }

    mod error_tests {
        use crate::error::AppError;

        #[test]
        fn error_codes_are_stable() {
            assert_eq!(AppError::InvalidSocketCount.code(), "INVALID_SOCKET_COUNT");
            assert_eq!(AppError::InvalidGridColumns.code(), "INVALID_GRID_COLUMNS");
            assert_eq!(
                AppError::PathNotWritable("x".into()).code(),
                "PATH_NOT_WRITABLE"
            );
            assert_eq!(AppError::NotFound.code(), "NOT_FOUND");
            assert_eq!(
                AppError::ProjectCorrupt("x".into()).code(),
                "PROJECT_CORRUPT"
            );
            assert_eq!(AppError::Locked.code(), "LOCKED");
            assert_eq!(AppError::SocketNotFound.code(), "SOCKET_NOT_FOUND");
            assert_eq!(
                AppError::FileUnreadable("x".into()).code(),
                "FILE_UNREADABLE"
            );
            assert_eq!(AppError::UnsupportedFormat.code(), "UNSUPPORTED_FORMAT");
            assert_eq!(AppError::IsSelected.code(), "IS_SELECTED");
            assert_eq!(
                AppError::ConfirmationRequired.code(),
                "CONFIRMATION_REQUIRED"
            );
            assert_eq!(
                AppError::MissingRequiredColumn("x".into()).code(),
                "MISSING_REQUIRED_COLUMN"
            );
            assert_eq!(AppError::DuplicateId.code(), "DUPLICATE_ID");
            assert_eq!(AppError::MissingSocket.code(), "MISSING_SOCKET");
            assert_eq!(AppError::AssetMissing("x".into()).code(), "ASSET_MISSING");
            assert_eq!(
                AppError::ValidationError("x".into()).code(),
                "VALIDATION_ERROR"
            );
            assert_eq!(
                AppError::Database(rusqlite::Error::InvalidQuery).code(),
                "DATABASE_ERROR"
            );
            assert_eq!(
                AppError::Io(std::io::Error::from(std::io::ErrorKind::NotFound)).code(),
                "IO_ERROR"
            );
            assert_eq!(AppError::Internal("x".into()).code(), "INTERNAL_ERROR");
        }

        #[test]
        fn error_serializes_to_envelope() {
            let err = AppError::InvalidSocketCount;
            let json = serde_json::to_value(&err).unwrap();
            assert_eq!(json["code"], "INVALID_SOCKET_COUNT");
            assert_eq!(json["message"], "socket_count must be positive");
            assert!(json["details"].is_null());
        }

        #[test]
        fn database_error_conversion() {
            let db_err = rusqlite::Error::InvalidQuery;
            let app_err: AppError = db_err.into();
            assert!(matches!(app_err, AppError::Database(_)));
            assert_eq!(app_err.code(), "DATABASE_ERROR");
        }

        #[test]
        fn io_error_conversion() {
            let io_err = std::io::Error::from(std::io::ErrorKind::NotFound);
            let app_err: AppError = io_err.into();
            assert!(matches!(app_err, AppError::Io(_)));
            assert_eq!(app_err.code(), "IO_ERROR");
        }
    }

    mod project_tests {
        use crate::error::AppError;
        use crate::project::{create_project_service, get_project_service, update_project_service};
        use tempfile::tempdir;

        #[test]
        fn creates_project_with_ordered_fixed_sockets() {
            let dir = tempdir().unwrap();
            let project = create_project_service("Major Arcana", 3, dir.path()).unwrap();
            assert_eq!(project.name, "Major Arcana");
            assert_eq!(project.grid_columns, 3);
            assert_eq!(project.sockets.len(), 3);
            assert_eq!(project.sockets[0].position, 0);
            assert_eq!(project.sockets[1].position, 1);
            assert_eq!(project.sockets[2].position, 2);
            assert!(dir.path().join(".tarot/project.sqlite").exists());
            assert!(dir.path().join(".tarot/assets").exists());
            assert!(dir.path().join(".tarot/previews").exists());
        }

        #[test]
        fn rejects_invalid_socket_count_without_partial_bundle() {
            let dir = tempdir().unwrap();
            let err = create_project_service("Deck", 0, dir.path()).unwrap_err();
            assert!(matches!(err, AppError::InvalidSocketCount));
            assert!(!dir.path().join(".tarot").exists());
        }

        #[test]
        fn rejects_unwritable_path_without_partial_bundle() {
            let file = tempfile::NamedTempFile::new().unwrap();
            let err = create_project_service("Deck", 1, file.path()).unwrap_err();
            assert!(matches!(err, AppError::PathNotWritable(_)));
        }

        #[test]
        fn gets_existing_project() {
            let dir = tempdir().unwrap();
            create_project_service("Tarot Deck", 2, dir.path()).unwrap();
            let loaded = get_project_service(dir.path()).unwrap();
            assert_eq!(loaded.name, "Tarot Deck");
            assert_eq!(loaded.sockets.len(), 2);
        }

        #[test]
        fn get_project_not_found() {
            let dir = tempdir().unwrap();
            let err = get_project_service(dir.path()).unwrap_err();
            assert!(matches!(err, AppError::NotFound));
        }

        #[test]
        fn updates_project_name_and_grid_columns() {
            let dir = tempdir().unwrap();
            create_project_service("Initial", 2, dir.path()).unwrap();
            let updated = update_project_service(dir.path(), Some("Renamed"), Some(4)).unwrap();
            assert_eq!(updated.name, "Renamed");
            assert_eq!(updated.grid_columns, 4);

            let reloaded = get_project_service(dir.path()).unwrap();
            assert_eq!(reloaded.name, "Renamed");
            assert_eq!(reloaded.grid_columns, 4);
        }

        #[test]
        fn rejects_invalid_grid_columns() {
            let dir = tempdir().unwrap();
            create_project_service("Test", 2, dir.path()).unwrap();
            let err0 = update_project_service(dir.path(), None, Some(0)).unwrap_err();
            let err5 = update_project_service(dir.path(), None, Some(5)).unwrap_err();
            assert!(matches!(err0, AppError::InvalidGridColumns));
            assert!(matches!(err5, AppError::InvalidGridColumns));
        }
    }

    mod socket_tests {
        use crate::error::AppError;
        use crate::project::{create_project_service, get_project_service};
        use crate::socket::{
            archive_socket_service, reorder_sockets_service, select_winner_service,
            set_socket_lock_service, update_socket_service,
        };
        use tempfile::tempdir;

        #[test]
        fn updates_unlocked_socket() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 2, dir.path()).unwrap();
            let s1_id = p.sockets[0].id;

            let updated = update_socket_service(
                dir.path(),
                s1_id,
                Some("The Fool"),
                Some("Card 0"),
                Some(r#"{"status":"in_progress"}"#),
            )
            .unwrap();

            assert_eq!(updated.title, "The Fool");
            assert_eq!(updated.notes, "Card 0");
            assert_eq!(updated.metadata_json, r#"{"status":"in_progress"}"#);
        }

        #[test]
        fn locked_socket_rejects_content_update() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            set_socket_lock_service(dir.path(), s_id, true).unwrap();

            let err = update_socket_service(dir.path(), s_id, Some("Modified Title"), None, None)
                .unwrap_err();

            assert!(matches!(err, AppError::Locked));
        }

        #[test]
        fn set_socket_lock_toggles_lock() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let locked = set_socket_lock_service(dir.path(), s_id, true).unwrap();
            assert!(locked.locked);

            let unlocked = set_socket_lock_service(dir.path(), s_id, false).unwrap();
            assert!(!unlocked.locked);
        }

        #[test]
        fn reorders_sockets_atomically() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 3, dir.path()).unwrap();
            let id0 = p.sockets[0].id;
            let id1 = p.sockets[1].id;
            let id2 = p.sockets[2].id;

            let reordered = reorder_sockets_service(dir.path(), &[id2, id0, id1]).unwrap();

            assert_eq!(reordered.sockets[0].id, id2);
            assert_eq!(reordered.sockets[0].position, 0);
            assert_eq!(reordered.sockets[1].id, id0);
            assert_eq!(reordered.sockets[1].position, 1);
            assert_eq!(reordered.sockets[2].id, id1);
            assert_eq!(reordered.sockets[2].position, 2);
        }

        #[test]
        fn reorder_rejects_duplicate_ids() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 2, dir.path()).unwrap();
            let id0 = p.sockets[0].id;

            let err = reorder_sockets_service(dir.path(), &[id0, id0]).unwrap_err();
            assert!(matches!(err, AppError::DuplicateId));
        }

        #[test]
        fn reorder_rejects_missing_socket_ids() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 3, dir.path()).unwrap();
            let id0 = p.sockets[0].id;

            let err = reorder_sockets_service(dir.path(), &[id0, 9999, 8888]).unwrap_err();
            assert!(matches!(err, AppError::MissingSocket));
        }

        #[test]
        fn archive_socket_rejects_locked() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            set_socket_lock_service(dir.path(), s_id, true).unwrap();
            let err = archive_socket_service(dir.path(), s_id).unwrap_err();
            assert!(matches!(err, AppError::Locked));
        }

        #[test]
        fn archive_socket_deletes_unlocked() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            archive_socket_service(dir.path(), s_id).unwrap();
            let loaded = get_project_service(dir.path()).unwrap();
            assert_eq!(loaded.sockets.len(), 0);
        }

        /// Insert a bare work row directly (the work service lands in T-12).
        fn insert_work(dir: &std::path::Path, socket_id: i64) -> i64 {
            let conn = crate::db::open(dir).unwrap();
            conn.execute(
                "INSERT INTO works (socket_id, asset_hash, asset_path, media_kind) VALUES (?1, 'hash', 'assets/hash.png', 'image')",
                [socket_id],
            )
            .unwrap();
            conn.last_insert_rowid()
        }

        #[test]
        fn select_winner_sets_and_clears() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;
            let work_id = insert_work(dir.path(), s_id);

            let selected = select_winner_service(dir.path(), s_id, Some(work_id)).unwrap();
            assert_eq!(selected.selected_work_id, Some(work_id));

            let cleared = select_winner_service(dir.path(), s_id, None).unwrap();
            assert_eq!(cleared.selected_work_id, None);
        }

        #[test]
        fn select_winner_rejects_locked_socket() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;
            let work_id = insert_work(dir.path(), s_id);

            set_socket_lock_service(dir.path(), s_id, true).unwrap();
            let err = select_winner_service(dir.path(), s_id, Some(work_id)).unwrap_err();
            assert!(matches!(err, AppError::Locked));
        }

        #[test]
        fn select_winner_rejects_missing_work() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let err = select_winner_service(dir.path(), s_id, Some(9999)).unwrap_err();
            assert!(matches!(err, AppError::NotFound));
        }
    }
}
