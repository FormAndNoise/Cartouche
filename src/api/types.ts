/**
 * Domain types for the Tarot Socket Board frontend.
 *
 * These mirror the backend contract documented in docs/api.md and
 * ARCHITECTURE.md §4/§5. IDs are strings at the UI boundary (opaque),
 * even when the Rust backend uses integers internally.
 */

export type MediaKind = "image" | "pdf" | "docx" | "text" | "other";

export type SocketStatus =
  "not_started" | "in_progress" | "needs_review" | "done";

/**
 * Fixed metadata schema (REQUIREMENTS.md §6.3).
 * The editor renders exactly these fields; `metadata_json` in the DB
 * supports arbitrary keys for future extension.
 */
export interface SocketMetadata {
  status: SocketStatus;
  medium: string;
  tags: string;
  due_date: string | null; // RFC 3339 date (YYYY-MM-DD) or null
}

export const STATUS_OPTIONS: { value: SocketStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "needs_review", label: "Needs review" },
  { value: "done", label: "Done" },
];

export function emptyMetadata(): SocketMetadata {
  return { status: "not_started", medium: "", tags: "", due_date: null };
}

/** One candidate work attached to a socket. */
export interface Work {
  id: string;
  socket_id: string;
  title: string;
  media_kind: MediaKind;
  mime_type: string | null;
  byte_size: number;
  sha256: string;
  /** Display URI for the generated thumbnail, or null while pending/failed. */
  preview_uri: string | null;
  preview_state: "pending" | "ready" | "failed";
  extracted_text_state: "none" | "pending" | "ready" | "failed" | "unsupported";
  extracted_text?: string;
  metadata_json: string;
}

export interface Socket {
  id: string;
  position: number;
  title: string;
  notes: string;
  locked: boolean;
  metadata: SocketMetadata;
  /** Winner selection; null = no winner chosen yet. */
  selected_work_id: string | null;
  works: Work[];
}

export interface Project {
  name: string;
  path: string;
  grid_columns: number; // 1..4 (REQUIREMENTS.md §6.2, capped at 4)
  sockets: Socket[];
}

/** Structured error envelope (US-B09, docs/api.md). */
export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details: Record<string, unknown> | null;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(envelope: ApiErrorEnvelope) {
    super(envelope.message);
    this.name = "ApiError";
    this.code = envelope.code;
    this.details = envelope.details;
  }
}

export interface CreateProjectRequest {
  name: string;
  socket_count: number;
  project_path: string;
}

export interface UpdateSocketRequest {
  title?: string;
  notes?: string;
  metadata?: SocketMetadata;
}

export interface JobStatus {
  state: "queued" | "running" | "done" | "failed";
  progress: number; // 0..100
  warnings: ImportWarning[];
  result?: ImportResult;
}

export interface ImportWarning {
  row: number;
  reason: string;
  code: string;
}

export interface ImportResult {
  rows_total: number;
  rows_processed: number;
  rows_skipped: number;
}

export interface CsvPreview {
  headers: string[];
  rows: string[][]; // first N data rows, raw strings
  rows_total: number;
}

export interface DroppedFilesResult {
  accepted: Work[];
  rejected: { path: string; reason: string; code: string }[];
}

export interface RepairScanResult {
  missing_assets: { work_id: string; asset_path: string }[];
  orphans: string[]; // asset paths with no referencing work
}
