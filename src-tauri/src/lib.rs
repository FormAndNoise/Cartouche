mod csv_import;
mod db;
mod error;
mod export;
mod extract;
mod models;
mod project;
mod repair;
mod socket;
mod work;

pub use csv_import::{get_job_service, import_csv_service, preview_csv_service};
pub use error::AppError;
pub use export::export_project_service;
pub use extract::extract_text_service;
pub use models::{Project, Socket, SocketId};
pub use project::{create_project, get_project, update_project};
pub use repair::repair_scan_service;
pub use socket::{archive_socket, reorder_sockets, select_winner, set_socket_lock, update_socket};
pub use work::{attach_work_service, import_dropped_files_service, remove_work_service};

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
            select_winner,
            work::attach_work,
            work::remove_work,
            work::import_dropped_files,
            csv_import::preview_csv,
            csv_import::import_csv,
            csv_import::get_job,
            extract::extract_text,
            export::export_project,
            repair::repair_scan
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

    mod work_tests {
        use crate::error::AppError;
        use crate::project::create_project_service;
        use crate::socket::{select_winner_service, set_socket_lock_service};
        use crate::work::{attach_work_service, import_dropped_files_service, remove_work_service};
        use std::fs;
        use tempfile::tempdir;

        const TINY_PNG: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x66,
            0x32, 0x9D, 0xD0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82,
        ];

        #[test]
        fn attach_creates_work_and_asset_file() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let img_path = dir.path().join("test.png");
            fs::write(&img_path, TINY_PNG).unwrap();

            let socket = attach_work_service(dir.path(), s_id, img_path.to_str().unwrap()).unwrap();
            assert_eq!(socket.works.len(), 1);
            let work = &socket.works[0];

            let asset_path = dir
                .path()
                .join(".tarot/assets")
                .join(format!("{}.png", work.sha256));
            assert!(asset_path.exists());
        }

        #[test]
        fn attach_deduplicates_identical_files() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let img_path = dir.path().join("test.png");
            fs::write(&img_path, TINY_PNG).unwrap();

            let _ = attach_work_service(dir.path(), s_id, img_path.to_str().unwrap()).unwrap();
            let socket = attach_work_service(dir.path(), s_id, img_path.to_str().unwrap()).unwrap();

            assert_eq!(socket.works.len(), 2);
            let sha = &socket.works[0].sha256;
            let asset_path = dir
                .path()
                .join(".tarot/assets")
                .join(format!("{}.png", sha));
            assert!(asset_path.exists());

            let entries = fs::read_dir(dir.path().join(".tarot/assets"))
                .unwrap()
                .count();
            assert_eq!(entries, 1);
        }

        #[test]
        fn attach_rejects_locked_socket() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let img_path = dir.path().join("test.png");
            fs::write(&img_path, TINY_PNG).unwrap();

            set_socket_lock_service(dir.path(), s_id, true).unwrap();
            let err =
                attach_work_service(dir.path(), s_id, img_path.to_str().unwrap()).unwrap_err();
            assert!(matches!(err, AppError::Locked));
        }

        #[test]
        fn attach_rejects_missing_file() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let err = attach_work_service(dir.path(), s_id, "/does/not/exist.png").unwrap_err();
            assert!(matches!(err, AppError::FileUnreadable(_)) || matches!(err, AppError::Io(_)));
        }

        #[test]
        fn remove_deletes_work_and_orphan_asset() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let img_path = dir.path().join("test.png");
            fs::write(&img_path, TINY_PNG).unwrap();

            let socket = attach_work_service(dir.path(), s_id, img_path.to_str().unwrap()).unwrap();
            let work_id = socket.works[0].id;
            let sha = &socket.works[0].sha256;

            let asset_path = dir
                .path()
                .join(".tarot/assets")
                .join(format!("{}.png", sha));
            assert!(asset_path.exists());

            let socket_after = remove_work_service(dir.path(), s_id, work_id, false).unwrap();
            assert!(socket_after.works.is_empty());
            assert!(!asset_path.exists());
        }

        #[test]
        fn remove_rejects_selected_winner_without_force() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let img_path = dir.path().join("test.png");
            fs::write(&img_path, TINY_PNG).unwrap();

            let socket = attach_work_service(dir.path(), s_id, img_path.to_str().unwrap()).unwrap();
            let work_id = socket.works[0].id;

            select_winner_service(dir.path(), s_id, Some(work_id)).unwrap();

            let err = remove_work_service(dir.path(), s_id, work_id, false).unwrap_err();
            assert!(matches!(err, AppError::IsSelected));
        }

        #[test]
        fn remove_with_force_clears_winner() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let img_path = dir.path().join("test.png");
            fs::write(&img_path, TINY_PNG).unwrap();

            let socket = attach_work_service(dir.path(), s_id, img_path.to_str().unwrap()).unwrap();
            let work_id = socket.works[0].id;

            select_winner_service(dir.path(), s_id, Some(work_id)).unwrap();

            let socket_after = remove_work_service(dir.path(), s_id, work_id, true).unwrap();
            assert!(socket_after.works.is_empty());
            assert_eq!(socket_after.selected_work_id, None);
        }

        #[test]
        fn import_dropped_handles_mixed() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let img_path = dir.path().join("test.png");
            fs::write(&img_path, TINY_PNG).unwrap();

            let res = import_dropped_files_service(
                dir.path(),
                s_id,
                &[
                    img_path.to_str().unwrap().to_string(),
                    "/fake/path.png".to_string(),
                ],
            )
            .unwrap();
            assert_eq!(res.accepted.len(), 1);
            assert_eq!(res.rejected.len(), 1);
        }

        #[test]
        fn preview_generated_for_image() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let img_path = dir.path().join("test.png");
            fs::write(&img_path, TINY_PNG).unwrap();

            let socket = attach_work_service(dir.path(), s_id, img_path.to_str().unwrap()).unwrap();
            let work = &socket.works[0];

            assert_eq!(work.preview_state, "ready");
            let preview_path = dir
                .path()
                .join(".tarot/previews")
                .join(format!("{}.png", work.id));
            assert!(preview_path.exists());
        }
    }

    mod csv_tests {
        use super::*;
        use crate::csv_import::{
            get_job_service, import_csv_service, parse_csv, preview_csv_service,
        };
        use crate::project::create_project_service;
        use tempfile::tempdir;

        #[test]
        fn parse_csv_handles_quotes_and_commas() {
            let csv = "title,notes\n\"Hello, World\",Simple note\n\"Quotes \"\"inside\"\"\",Second";
            let rows = parse_csv(csv);
            assert_eq!(rows.len(), 3);
            assert_eq!(rows[1][0], "Hello, World");
            assert_eq!(rows[2][0], "Quotes \"inside\"");
        }

        #[test]
        fn preview_csv_returns_headers_and_sample() {
            let dir = tempdir().unwrap();
            create_project_service("Deck", 4, dir.path()).unwrap();

            let csv = "Title,Status,Medium\nFool,in_progress,Digital\nMagician,done,Ink\nHigh Priestess,not_started,Oil";
            let preview = preview_csv_service(dir.path(), csv).unwrap();
            assert_eq!(preview.headers, vec!["title", "status", "medium"]);
            assert_eq!(preview.rows_total, 3);
            assert_eq!(preview.rows.len(), 3);
            assert_eq!(preview.rows[0][0], "Fool");
        }

        #[test]
        fn preview_csv_requires_title_column() {
            let dir = tempdir().unwrap();
            create_project_service("Deck", 4, dir.path()).unwrap();

            let csv = "Name,Status\nFool,done";
            let err = preview_csv_service(dir.path(), csv).unwrap_err();
            assert!(matches!(err, AppError::MissingRequiredColumn(_)));
        }

        #[test]
        fn import_csv_update_mode_populates_metadata_and_notes() {
            let dir = tempdir().unwrap();
            create_project_service("Deck", 2, dir.path()).unwrap();

            let csv = "title,notes,status,medium,tags,due_date\n0 - The Fool,First card,in_progress,Ink,\"major,opener\",2026-10-31\nI - Magician,Second card,done,Digital,major,";
            let res = import_csv_service(dir.path(), csv, "update").unwrap();
            assert_eq!(res.rows_total, 2);

            let job = get_job_service(dir.path(), &res.job_id).unwrap();
            assert_eq!(job.state, "done");
            assert_eq!(job.progress, 100);
            assert_eq!(job.warnings.len(), 0);
            assert_eq!(job.result.as_ref().unwrap().rows_processed, 2);

            let p = crate::project::get_project_service(dir.path()).unwrap();
            assert_eq!(p.sockets[0].title, "0 - The Fool");
            assert_eq!(p.sockets[0].notes, "First card");
            assert!(p.sockets[0]
                .metadata_json
                .contains("\"status\":\"in_progress\""));
            assert!(p.sockets[0].metadata_json.contains("\"medium\":\"Ink\""));
            assert!(p.sockets[0]
                .metadata_json
                .contains("\"due_date\":\"2026-10-31\""));

            assert_eq!(p.sockets[1].title, "I - Magician");
            assert!(p.sockets[1].metadata_json.contains("\"status\":\"done\""));
        }

        #[test]
        fn import_csv_append_mode_skips_filled_and_locked() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 3, dir.path()).unwrap();
            let s0_id = p.sockets[0].id;
            let s1_id = p.sockets[1].id;

            // Socket 0 is already filled
            crate::socket::update_socket_service(
                dir.path(),
                s0_id,
                Some("Filled Title"),
                None,
                None,
            )
            .unwrap();
            // Socket 1 is locked
            crate::socket::set_socket_lock_service(dir.path(), s1_id, true).unwrap();

            let csv = "title\nAppended Card";
            let res = import_csv_service(dir.path(), csv, "append").unwrap();
            let job = get_job_service(dir.path(), &res.job_id).unwrap();
            assert_eq!(job.result.as_ref().unwrap().rows_processed, 1);

            let fresh = crate::project::get_project_service(dir.path()).unwrap();
            assert_eq!(fresh.sockets[0].title, "Filled Title");
            assert_eq!(fresh.sockets[2].title, "Appended Card");
        }

        #[test]
        fn import_csv_records_warnings_and_skips_invalid_rows() {
            let dir = tempdir().unwrap();
            create_project_service("Deck", 3, dir.path()).unwrap();

            let csv = "title,status\n,in_progress\nValid Card,invalid_status\nGood Card,done";
            let res = import_csv_service(dir.path(), csv, "update").unwrap();
            let job = get_job_service(dir.path(), &res.job_id).unwrap();

            assert_eq!(job.result.as_ref().unwrap().rows_processed, 1);
            assert_eq!(job.result.as_ref().unwrap().rows_skipped, 2);
            assert_eq!(job.warnings.len(), 2);
            assert_eq!(job.warnings[0].code, "ROW_VALIDATION_ERROR");
            assert_eq!(job.warnings[1].code, "ROW_VALIDATION_ERROR");
        }
    }

    mod extract_tests {
        use super::*;
        use crate::extract::extract_text_service;
        use crate::project::create_project_service;
        use crate::work::attach_work_service;
        use std::fs;
        use tempfile::tempdir;

        #[test]
        fn extract_text_txt_ready() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let file_path = dir.path().join("notes.txt");
            fs::write(
                &file_path,
                "Major Arcana Notes\nThe Fool journey starts here.",
            )
            .unwrap();

            let socket =
                attach_work_service(dir.path(), s_id, file_path.to_str().unwrap()).unwrap();
            let work_id = socket.works[0].id;

            assert_eq!(socket.works[0].extracted_text_state, "ready");
            assert_eq!(
                socket.works[0].extracted_text.as_deref(),
                Some("Major Arcana Notes\nThe Fool journey starts here.")
            );

            let refreshed = extract_text_service(dir.path(), s_id, work_id).unwrap();
            assert_eq!(refreshed.works[0].extracted_text_state, "ready");
        }

        #[test]
        fn extract_text_rejects_unsupported() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 1, dir.path()).unwrap();
            let s_id = p.sockets[0].id;

            let file_path = dir.path().join("model.blend");
            fs::write(&file_path, b"BLENDER_DATA").unwrap();

            let socket =
                attach_work_service(dir.path(), s_id, file_path.to_str().unwrap()).unwrap();
            let work_id = socket.works[0].id;

            let err = extract_text_service(dir.path(), s_id, work_id).unwrap_err();
            assert!(matches!(err, AppError::UnsupportedFormat));
        }
    }

    mod export_tests {
        use crate::export::export_project_service;
        use crate::project::create_project_service;
        use tempfile::tempdir;

        #[test]
        fn export_project_creates_zip_with_manifest() {
            let dir = tempdir().unwrap();
            create_project_service("Deck", 2, dir.path()).unwrap();

            let zip_dest = dir.path().join("export.tarot.zip");
            let res = export_project_service(dir.path(), zip_dest.to_str().unwrap()).unwrap();

            assert!(zip_dest.exists());
            assert!(!res.manifest_sha256.is_empty());

            // Open zip and verify files inside
            let file = std::fs::File::open(&zip_dest).unwrap();
            let mut archive = zip::ZipArchive::new(file).unwrap();
            assert!(archive.by_name(".tarot/manifest.json").is_ok());
            assert!(archive.by_name(".tarot/project.sqlite").is_ok());
        }
    }

    mod repair_tests {
        use crate::project::create_project_service;
        use crate::repair::repair_scan_service;
        use crate::work::attach_work_service;
        use std::fs;
        use tempfile::tempdir;

        #[test]
        fn repair_scan_detects_missing_and_orphan_assets() {
            let dir = tempdir().unwrap();
            let p = create_project_service("Deck", 2, dir.path()).unwrap();
            let s0_id = p.sockets[0].id;

            // Attach a file
            let img_path = dir.path().join("card.txt");
            fs::write(&img_path, "card notes").unwrap();
            attach_work_service(dir.path(), s0_id, img_path.to_str().unwrap()).unwrap();

            // Create an orphan asset file manually in .tarot/assets
            let orphan_path = dir.path().join(".tarot/assets/orphan123.png");
            fs::write(&orphan_path, b"orphan").unwrap();

            let scan = repair_scan_service(dir.path()).unwrap();
            assert_eq!(scan.missing_assets.len(), 0);
            assert_eq!(scan.orphans, vec!["assets/orphan123.png"]);

            // Now delete the real asset file to simulate missing asset
            let conn = crate::db::open(dir.path()).unwrap();
            let asset_rel: String = conn
                .query_row("SELECT asset_path FROM works LIMIT 1", [], |r| r.get(0))
                .unwrap();
            let real_asset_path = dir.path().join(".tarot").join(&asset_rel);
            fs::remove_file(real_asset_path).unwrap();

            let scan2 = repair_scan_service(dir.path()).unwrap();
            assert_eq!(scan2.missing_assets.len(), 1);
            assert_eq!(scan2.missing_assets[0].asset_path, asset_rel);
        }
    }
}
