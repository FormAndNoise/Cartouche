/**
 * Domain types for the Tarot Socket Board frontend.
 *
 * These mirror the backend contract documented in docs/api.md and
 * ARCHITECTURE.md §4/§5. IDs are strings at the UI boundary (opaque),
 * even when the Rust backend uses integers internally.
 */

export type MediaKind = "image" | "pdf" | "docx" | "text" | "other";

export type SocketStatus =
  | "not_started"
  | "in_progress"
  | "needs_review"
  | "done";

export type MatrixLayoutMode =
  | "auto"
  | "dimensions"
  | "custom_grid"
  | "tag_group";

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

export interface ComfyProjectConfig {
  host?: string;
  model?: string;
  sampler_name?: string;
  scheduler?: string;
  steps?: number;
  cfg?: number;
  width?: number;
  height?: number;
  batch_size?: number;
  workflow_mode?: "builtin" | "active_workflow";
  custom_workflow_json?: string;
  style_prefix?: string;
  style_suffix?: string;
  negative_prompt?: string;
  include_symbolism?: boolean;
  auto_select_winner?: boolean;
  seed_policy?: "random" | "fixed" | "deck_stride";
  fixed_seed?: number;
}

export interface DetectedWorkflowNodes {
  has_active_workflow: boolean;
  pos_prompt_node?: string | null;
  neg_prompt_node?: string | null;
  ksampler_nodes: string[];
  save_image_nodes: string[];
  checkpoint_node?: string | null;
}

export interface ComfyServerInfo {
  host: string;
  online: boolean;
  models: string[];
  samplers: string[];
  schedulers: string[];
  active_workflow: DetectedWorkflowNodes;
  error?: string | null;
}

export interface ComfyWorkMetadata {
  source?: string;
  positive_prompt?: string | null;
  negative_prompt?: string | null;
  model?: string | null;
  sampler_name?: string | null;
  scheduler?: string | null;
  steps?: number | null;
  cfg?: number | null;
  seed?: number | null;
  width?: number | null;
  height?: number | null;
  prompt_id?: string | null;
}

export interface ComfyGenerateRequest {
  host?: string;
  prompt: string;
  negative_prompt?: string;
  model: string;
  sampler_name: string;
  scheduler: string;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  batch_size: number;
  seed?: number;
  workflow_mode?: "builtin" | "active_workflow";
  sync_prompt_to_notes?: boolean;
  auto_select_winner?: boolean;
}

export interface ComfyQueueResponse {
  prompt_id: string;
  socket_id: string;
  seed_used: number;
  effective_prompt: string;
}

export interface ComfyPollResponse {
  prompt_id: string;
  status: "running" | "done" | "failed";
  works_added: number;
  socket?: Socket | null;
  message?: string | null;
}

export interface ComfyHistoryItem {
  prompt_id: string;
  filename: string;
  subfolder: string;
  folder_type: string;
  preview_url: string;
  positive_prompt: string;
  negative_prompt: string;
  model: string;
  sampler_name: string;
  scheduler: string;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
}

export const DEFAULT_COMFY_CONFIG: Required<ComfyProjectConfig> = {
  host: "http://localhost:8188",
  model: "sd_xl_base_1.0.safetensors",
  sampler_name: "euler",
  scheduler: "normal",
  steps: 20,
  cfg: 7.0,
  width: 768,
  height: 1344,
  batch_size: 1,
  workflow_mode: "builtin",
  style_prefix: "",
  style_suffix: "",
  negative_prompt:
    "blurry, low quality, watermark, signature, ugly, deformed, extra text, border",
  include_symbolism: false,
  auto_select_winner: true,
  seed_policy: "random",
  fixed_seed: 424242,
  custom_workflow_json: "",
};

export function parseWorkComfyMetadata(work: Work): ComfyWorkMetadata | null {
  if (!work.metadata_json || work.metadata_json === "{}") return null;
  try {
    const parsed = JSON.parse(work.metadata_json) as ComfyWorkMetadata;
    if (
      parsed &&
      (parsed.source === "comfyui" ||
        parsed.positive_prompt ||
        parsed.model ||
        parsed.sampler_name ||
        parsed.seed !== undefined)
    ) {
      return parsed;
    }
  } catch {
    /* ignore malformed json */
  }
  return null;
}

export function composeSocketComfyPrompt(
  socket: Socket,
  config?: ComfyProjectConfig,
  rawOverride?: string,
): string {
  const baseText =
    rawOverride !== undefined
      ? rawOverride.trim()
      : socket.notes.trim() || socket.title.trim();

  const parts: string[] = [];
  if (config?.style_prefix?.trim()) {
    parts.push(config.style_prefix.trim());
  }
  if (baseText) {
    parts.push(baseText);
  }
  if (config?.include_symbolism && socket.metadata.symbolism) {
    const sym = socket.metadata.symbolism;
    const symParts = [
      sym.composition_brief,
      sym.visual_motifs,
      sym.color_palette ? `Palette: ${sym.color_palette}` : undefined,
    ]
      .map((s) => s?.trim())
      .filter(Boolean);
    if (symParts.length > 0) {
      parts.push(symParts.join(". "));
    }
  }
  if (config?.style_suffix?.trim()) {
    parts.push(config.style_suffix.trim());
  }
  return parts.join(", ");
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
  comfy_config?: ComfyProjectConfig;
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
