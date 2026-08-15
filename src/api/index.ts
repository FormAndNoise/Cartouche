/**
 * Client factory: pick the right BackendClient for the runtime.
 *
 * - Inside the Tauri shell  -> TauriBackendClient (real Rust backend).
 * - Plain browser / tests   -> MockBackendClient (in-memory, contract-faithful).
 *
 * `?mock=1` forces the mock even inside Tauri (useful for UI-only demos).
 */
import type { BackendClient } from "./client";
import { MockBackendClient } from "./mockClient";
import { isTauriAvailable, TauriBackendClient } from "./tauriClient";

let shared: BackendClient | null = null;
let sharedMock: MockBackendClient | null = null;

export function createBackendClient(): BackendClient {
  if (shared) return shared;
  const forceMock =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mock") === "1";
  if (!forceMock && isTauriAvailable()) {
    shared = new TauriBackendClient();
  } else {
    sharedMock = new MockBackendClient();
    shared = sharedMock;
  }
  return shared;
}

/** Non-null only when the active client is the mock (browser/demo mode). */
export function getMockClient(): MockBackendClient | null {
  return sharedMock;
}

export function isMockMode(): boolean {
  return sharedMock !== null;
}
