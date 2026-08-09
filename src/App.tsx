import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Root application component.
 *
 * On first render, pings the backend `app_version` command (smoke test for IPC).
 * The backend is stubbed during the scaffold phase; see US-B01 for the eventual
 * IPC bridge. When running under Vite (no Tauri backend), the invocation is
 * caught and a fallback is shown so the UI remains testable.
 */
export default function App() {
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    invoke<string>("app_version")
      .then((v) => setVersion(v))
      .catch(() => {
        // Expected outside Tauri (Vitest / standalone Vite dev).
        setVersion("dev (no backend)");
      });
  }, []);

  return (
    <main className="app-root" data-testid="app-root">
      <header className="app-header">
        <h1>Tarot Socket Board</h1>
        <span className="app-version" data-testid="app-version">
          {version}
        </span>
      </header>
      <section className="app-placeholder" data-testid="app-placeholder">
        <p>Project scaffold ready. Backend and UI components are pending — see REQUIREMENTS.md.</p>
      </section>
    </main>
  );
}
