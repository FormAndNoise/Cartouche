import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri `invoke` so the wrappers are tested without a live webview.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  ApiError,
  archiveSocket,
  createProject,
  getProject,
  normalizeApiError,
  reorderSockets,
  selectWinner,
  setSocketLock,
  updateProject,
  updateSocket,
  type Project,
  type Socket,
} from "../lib/api";

const mockInvoke = vi.mocked(invoke);

const socket: Socket = {
  id: "7",
  position: 0,
  title: "The Fool",
  notes: "",
  locked: false,
  metadata: { status: "not_started", medium: "", tags: "", due_date: null },
  selected_work_id: null,
  works: [],
};

const project: Project = {
  name: "Major Arcana",
  path: "/tmp/deck",
  grid_columns: 3,
  sockets: [socket],
};

describe("IPC command wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createProject maps to create_project with camelCase args", async () => {
    mockInvoke.mockResolvedValueOnce(project);

    const result = await createProject({
      name: "Major Arcana",
      socketCount: 22,
      projectPath: "/tmp/deck",
    });

    expect(result).toEqual(project);
    expect(mockInvoke).toHaveBeenCalledWith("create_project", {
      name: "Major Arcana",
      socketCount: 22,
      projectPath: "/tmp/deck",
    });
  });

  it("getProject forwards the project path", async () => {
    mockInvoke.mockResolvedValueOnce(project);

    const result = await getProject("/tmp/deck");

    expect(result).toEqual(project);
    expect(mockInvoke).toHaveBeenCalledWith("get_project", {
      projectPath: "/tmp/deck",
    });
  });

  it("updateProject forwards optional fields", async () => {
    mockInvoke.mockResolvedValueOnce(project);

    await updateProject({
      projectPath: "/tmp/deck",
      name: "Renamed",
      gridColumns: 4,
    });

    expect(mockInvoke).toHaveBeenCalledWith("update_project", {
      projectPath: "/tmp/deck",
      name: "Renamed",
      gridColumns: 4,
    });
  });

  it("updateSocket forwards content fields", async () => {
    mockInvoke.mockResolvedValueOnce(socket);

    const result = await updateSocket({
      projectPath: "/tmp/deck",
      socketId: 7,
      title: "The Fool",
      notes: "Card 0",
      metadata: { status: "in_progress" },
    });

    expect(result).toEqual(socket);
    expect(mockInvoke).toHaveBeenCalledWith("update_socket", {
      projectPath: "/tmp/deck",
      socketId: 7,
      title: "The Fool",
      notes: "Card 0",
      metadata: { status: "in_progress" },
    });
  });

  it("setSocketLock forwards the lock flag", async () => {
    mockInvoke.mockResolvedValueOnce({ ...socket, locked: true });

    const result = await setSocketLock({
      projectPath: "/tmp/deck",
      socketId: 7,
      locked: true,
    });

    expect(result.locked).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("set_socket_lock", {
      projectPath: "/tmp/deck",
      socketId: 7,
      locked: true,
    });
  });

  it("reorderSockets forwards the ordered id list", async () => {
    mockInvoke.mockResolvedValueOnce(project);

    await reorderSockets({
      projectPath: "/tmp/deck",
      orderedSocketIds: [3, 1, 2],
    });

    expect(mockInvoke).toHaveBeenCalledWith("reorder_sockets", {
      projectPath: "/tmp/deck",
      orderedSocketIds: [3, 1, 2],
    });
  });

  it("archiveSocket resolves void", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await expect(
      archiveSocket({ projectPath: "/tmp/deck", socketId: 7 }),
    ).resolves.toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledWith("archive_socket", {
      projectPath: "/tmp/deck",
      socketId: 7,
    });
  });

  it("selectWinner forwards a nullable work id", async () => {
    mockInvoke.mockResolvedValueOnce(socket);

    await selectWinner({ projectPath: "/tmp/deck", socketId: 7, workId: null });

    expect(mockInvoke).toHaveBeenCalledWith("select_winner", {
      projectPath: "/tmp/deck",
      socketId: 7,
      workId: null,
    });
  });

  it("rethrows backend error envelopes as ApiError", async () => {
    mockInvoke.mockRejectedValueOnce({
      code: "LOCKED",
      message: "socket is locked",
      details: null,
    });

    const err = await setSocketLock({
      projectPath: "/tmp/deck",
      socketId: 7,
      locked: true,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("LOCKED");
    expect((err as ApiError).message).toBe("socket is locked");
  });

  it("normalizes unstructured failures to INTERNAL_ERROR", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("no backend"));

    const err = await getProject("/tmp/deck").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("INTERNAL_ERROR");
    expect((err as ApiError).message).toBe("no backend");
  });
});

describe("normalizeApiError", () => {
  it("passes through existing ApiError instances", () => {
    const original = new ApiError({
      code: "NOT_FOUND",
      message: "project not found",
      details: null,
    });
    expect(normalizeApiError(original)).toBe(original);
  });

  it("unwraps {error: envelope} rejections", () => {
    const err = normalizeApiError({
      error: { code: "LOCKED", message: "socket is locked", details: null },
    });
    expect(err.code).toBe("LOCKED");
  });

  it("maps non-object rejections to INTERNAL_ERROR", () => {
    const err = normalizeApiError("boom");
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toBe("boom");
  });
});
