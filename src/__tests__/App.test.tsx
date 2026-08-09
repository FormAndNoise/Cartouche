import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri `invoke` so the component does not depend on a live webview.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("0.1.0-test"),
}));

// Stub matchMedia for jsdom (some components may query it; harmless if unused).
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";

describe("App smoke test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the app header and resolves the backend version (IPC smoke test)", async () => {
    render(<App />);

    // Header is static — should appear immediately.
    expect(
      screen.getByRole("heading", { name: /tarot socket board/i }),
    ).toBeInTheDocument();

    // The version placeholder resolves to the mocked backend response,
    // proving the IPC `invoke` path is wired and awaited.
    await waitFor(() => {
      expect(screen.getByTestId("app-version")).toHaveTextContent(
        "0.1.0-test",
      );
    });
  });

  it("falls back gracefully when the backend is unavailable", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("no backend"),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("app-version")).toHaveTextContent(
        /dev \(no backend\)/,
      );
    });
  });
});
