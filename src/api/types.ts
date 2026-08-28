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

export type MatrixLayoutMode =
 "auto" | "dimensions" | "custom_grid" | "tag_group";

export interface CustomMatrixColumn {
 id: string;
 label: string;
 tagOrPrefix?: string;
 notes?: string;
}

export interface CustomMatrixRow {
 id: string;
 label: string;
 notes?: string;
}

export interface MatrixConfig {
 mode?: MatrixLayoutMode;
 preset?:
 | "tarot"
 | "playing_cards"
 | "tcg_factions"
 | "board_game"
 | "design_tokens"
 | "custom";
 columnCount?: number;
 rowCount?: number;
 columns?: CustomMatrixColumn[];
 rows?: CustomMatrixRow[];
 tagKey?: string;
 sliceMode?: "sequential" | "interleaved" | "by_tag";
 updated_at?: string;
}

export interface ProjectMetadata {
 author?: string;
 studio?: string;
 copyright?: string;
 license?: string;
 ai_policy?: string;
 trademark?: string;
 edition?: string;
 description?: string;
 planning_matrix?: PlanningMatrixData;
 matrix_config?: MatrixConfig;
}

export interface SubgroupDimension {
 id: string; // e.g. "wands", "cups", "swords", "pentacles", "major"
 label: string;
 element?: string;
 theme?: string;
 palette?: string;
 motifs?: string;
 notes?: string;
}

export interface RankDimension {
 rankIndex: number;
 rankLabel: string;
 meaning?: string;
 composition_rule?: string;
 archetype?: string;
}

export interface SocketTenantSymbolism {
 core_meaning?: string;
 visual_motifs?: string;
 color_palette?: string;
 composition_brief?: string;
 elemental_attribution?: string;
 custom_attributes?: Record<string, string>;
}

export interface PlanningMatrixData {
 subgroups: SubgroupDimension[];
 ranks: RankDimension[];
 columns?: { key: string; label: string }[];
 updated_at?: string;
}

export function emptyProjectMetadata(): ProjectMetadata {
 return {
 author: "",
 studio: "",
 copyright: "",
 license: "",
 ai_policy: "",
 trademark: "",
 edition: "",
 description: "",
 planning_matrix: {
 subgroups: [],
 ranks: [],
 },
 };
}

export interface ProvenanceAuditEntry {
 id: string;
 timestamp: string;
 event: string;
 work_id?: string;
 asset_filename: string;
 previous_sha256?: string;
 sha256_hash: string;
 byte_size: number;
 byte_size_delta?: number;
 notes?: string;
}

/**
 * Socket metadata schema.
 * Supports lifecycle status, medium, tags, due_date, rights overrides, forensic provenance, and symbolism matrix.
 */
export interface SocketMetadata {
 status: SocketStatus;
 medium: string;
 tags: string;
 due_date: string | null; // RFC 3339 date (YYYY-MM-DD) or null
 author_override?: string;
 license_override?: string;
 provenance_ledger?: ProvenanceAuditEntry[];
 symbolism?: SocketTenantSymbolism;
}

export interface OpenExternalEditorResult {
 path: string;
 work_id: string;
 original_sha256: string;
 message: string;
}

export interface SyncExternalEditsResult {
 modified: boolean;
 socket: Socket;
 old_sha256: string;
 new_sha256: string;
 message: string;
}

export const STATUS_OPTIONS: { value: SocketStatus; label: string }[] = [
 { value: "not_started", label: "Not started" },
 { value: "in_progress", label: "In progress" },
 { value: "needs_review", label: "Needs review" },
 { value: "done", label: "Done" },
];

export function emptyMetadata(): SocketMetadata {
 return {
 status: "not_started",
 medium: "",
 tags: "",
 due_date: null,
 author_override: "",
 license_override: "",
 provenance_ledger: [],
 };
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
 metadata?: ProjectMetadata;
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
