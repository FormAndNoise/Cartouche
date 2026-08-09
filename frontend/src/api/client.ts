/**
 * Backend client contract.
 *
 * Every UI component talks to the backend exclusively through this
 * interface (task step 3: "Talk to the backend through the documented
 * contract; stub or mock it behind a small client module so the UI is
 * testable without a live server").
 *
 * Two implementations exist:
 *  - MockBackendClient (src/api/mockClient.ts): in-memory, used in tests
 *    and when the app runs outside the Tauri shell (vite dev server).
 *  - TauriBackendClient (src/api/tauriClient.ts): thin adapter over the
 *    Tauri IPC command bridge (docs/api.md / ARCHITECTURE.md §4).
 *
 * All methods reject with ApiError carrying the structured envelope
 * {code, message, details} (US-B09).
 */
import type {
  CreateProjectRequest,
  CsvPreview,
  DroppedFilesResult,
  JobStatus,
  Project,
  RepairScanResult,
  Socket,
  UpdateSocketRequest,
} from './types';

export interface BackendClient {
  // Projects
  createProject(req: CreateProjectRequest): Promise<Project>;
  getProject(projectPath: string): Promise<Project>;
  updateProject(req: {
    project_path: string;
    name?: string;
    grid_columns?: number;
  }): Promise<Project>;

  // Sockets
  updateSocket(req: {
    project_path: string;
    socket_id: string;
  } & UpdateSocketRequest): Promise<Socket>;
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

  // CSV import (background job)
  previewCsv(req: { project_path: string; csv_text: string }): Promise<CsvPreview>;
  importCsv(req: {
    project_path: string;
    csv_text: string;
    mode: 'append' | 'update';
  }): Promise<{ job_id: string; rows_total: number }>;
  getJob(req: { project_path: string; job_id: string }): Promise<JobStatus>;

  // Works extras
  refreshExtractedText(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
  }): Promise<Socket>;

  // Maintenance
  exportProject(req: {
    project_path: string;
    destination_path: string;
  }): Promise<{ path: string; manifest_sha256: string }>;
  repairScan(req: { project_path: string }): Promise<RepairScanResult>;
}
