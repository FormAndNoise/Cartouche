-- Migration 001: Initial schema (v1)
-- Creates the 6 tables matching ARCHITECTURE.md §5 / US-D02.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    grid_columns INTEGER NOT NULL DEFAULT 3 CHECK (grid_columns BETWEEN 1 AND 4),
    schema_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sockets (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    locked INTEGER NOT NULL DEFAULT 0,
    selected_work_id INTEGER,
    UNIQUE(project_id, position)
);

CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY,
    socket_id INTEGER NOT NULL REFERENCES sockets(id) ON DELETE CASCADE,
    asset_hash TEXT NOT NULL,
    asset_path TEXT NOT NULL,
    media_kind TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS previews (
    work_id INTEGER PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    path TEXT,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS extracted_text (
    work_id INTEGER PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    content TEXT,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS import_jobs (
    id INTEGER PRIMARY KEY,
    state TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    result_json TEXT
);