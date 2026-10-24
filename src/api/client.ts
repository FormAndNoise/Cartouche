/**
 * Backend client contract.
 *
 * Every UI component talks to the backend exclusively through this
 * interface.
 *
 * Two implementations exist:
 * - MockBackendClient (src/api/mockClient.ts): in-memory, used in tests
 * and when the app runs outside the Tauri shell (vite dev server).
 * - TauriBackendClient (src/api/tauriClient.ts): adapter over the
 * Tauri IPC command bridge (docs/api.md / ARCHITECTURE.md §4).
 *
 * All methods reject with ApiError carrying the structured envelope
 * {code, message, details} (US-B09).
 */
import type {
  ComfyGenerateRequest,
  ComfyHistoryItem,
  ComfyPollResponse,
  ComfyQueueResponse,
  ComfyServerInfo,
  CreateProjectRequest,
  CsvPreview,
  DroppedFilesResult,
  JobStatus,
  OpenExternalEditorResult,
  Project,
  ProjectMetadata,
  RepairScanResult,
  Socket,
  SyncExternalEditsResult,
  UpdateSocketRequest,
} from "./types";

export interface BackendClient {
  // Projects
  createProject(req: CreateProjectRequest): Promise<Project>;
  getProject(projectPath: string): Promise<Project>;
  updateProject(req: {
    project_path: string;
    name?: string;
    grid_columns?: number;
    metadata?: ProjectMetadata;
  }): Promise<Project>;

  // Sockets
  updateSocket(
    req: {
      project_path: string;
      socket_id: string;
    } & UpdateSocketRequest,
  ): Promise<Socket>;
  setSocketLock(req: {
    project_path: string;
    socket_id: string;
    locked: boolean;
  }): Promise<Socket>;
  reorderSockets(req: {
    project_path: string;
    ordered_socket_ids: string[];
  }): Promise<Project>;
  selectWinner(req: {
    project_path: string;
    socket_id: string;
    work_id: string | null;
  }): Promise<Socket>;

  // Works & files
  attachWork(req: {
    project_path: string;
    socket_id: string;
    source_path: string;
  }): Promise<Socket>;
  importDroppedFiles(req: {
    project_path: string;
    socket_id: string;
    paths: string[];
  }): Promise<DroppedFilesResult>;
  removeWork(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
    force?: boolean;
  }): Promise<Socket>;
  moveWork(req: {
    project_path: string;
    source_socket_id: string;
    target_socket_id: string;
    work_id: string;
  }): Promise<Project>;
  openInExternalEditor(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
  }): Promise<OpenExternalEditorResult>;
  syncExternalEdits(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
  }): Promise<SyncExternalEditsResult>;

  // CSV import / export
  previewCsv(req: {
    project_path: string;
    csv_text: string;
  }): Promise<CsvPreview>;
  importCsv(req: {
    project_path: string;
    csv_text: string;
    mode: "append" | "update";
  }): Promise<{ job_id: string; rows_total: number }>;
  exportCsv(projectPath: string): Promise<string>;
  getJob(req: { project_path: string; job_id: string }): Promise<JobStatus>;

  // Works extras
  refreshExtractedText(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
  }): Promise<Socket>;

  // Maintenance & packages (.crtch)
  exportProject(req: {
    project_path: string;
    destination_path: string;
  }): Promise<{ path: string; manifest_sha256: string }>;
  importProject(req: {
    package_path: string;
    destination_path: string;
  }): Promise<Project>;
  repairScan(req: { project_path: string }): Promise<RepairScanResult>;

  // ComfyUI Collaboration Bridge
  getComfyServerInfo(host?: string): Promise<ComfyServerInfo>;
  queueComfySocket(req: {
    project_path: string;
    socket_id: string;
    request: ComfyGenerateRequest;
  }): Promise<ComfyQueueResponse>;
  pollComfyPrompt(req: {
    project_path: string;
    socket_id: string;
    prompt_id: string;
    host?: string;
    auto_select_winner?: boolean;
  }): Promise<ComfyPollResponse>;
  listComfyHistory(req?: {
    host?: string;
    limit?: number;
  }): Promise<ComfyHistoryItem[]>;
  importComfyHistoryItem(req: {
    project_path: string;
    socket_id: string;
    host?: string;
    filename: string;
    subfolder: string;
    folder_type: string;
    prompt_override?: string;
    overwrite_socket_notes?: boolean;
  }): Promise<Socket>;
}
