# Tarot Socket Board backend contract

The application is local-only: these operations are Rust services exposed through Tauri IPC; there is no HTTP server and no credentials.

## Error envelope

Commands return either a success payload or `{ "error": { "code": string, "message": string, "details": object|null } }`. Codes include `INVALID_SOCKET_COUNT`, `PATH_NOT_WRITABLE`, `NOT_FOUND`, `PROJECT_CORRUPT`, `LOCKED`, `SOCKET_NOT_FOUND`, `FILE_UNREADABLE`, `UNSUPPORTED_FORMAT`, `MISSING_REQUIRED_COLUMN`, `IS_SELECTED`, and `INTERNAL_ERROR`.

## Core operations

- `create_project({name, socket_count, project_path})` → `Project` (success), errors 400/409. Creates `.tarot/project.sqlite`, `assets/`, `previews/`; sockets are ordered and fixed-count.
- `get_project({project_path})` → `Project`, errors `NOT_FOUND` or `PROJECT_CORRUPT`.
- `update_project({project_path, name?, grid_columns?})` → `Project`; auto-committed.
- `update_socket({project_path, socket_id, locked?, title?, notes?, metadata?})` → `Socket`; locked sockets reject destructive/content edits with `LOCKED`.
- `set_socket_lock({project_path, socket_id, locked})` → `Socket`.

`Project` contains `name`, `path`, `grid_columns`, and ordered `sockets`. `Socket` contains `id`, `position`, `title`, `notes`, and `locked`. SQLite schema version is 1 and includes `projects`, `sockets`, `works`, `previews`, `extracted_text`, and `import_jobs`.

The remaining planned services (works, CSV jobs, extraction, previews, export/import, repair scan) have reserved error codes above but are not exposed until their dependent UI/worker milestones are implemented. No invented HTTP API is provided.
