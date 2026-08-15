/**
 * Component-level tests for Milestone 2 (UI Shell + Grid).
 * Covers: project creation/opening (US-F01), grid + density (US-F02),
 * card states (US-F03), metadata editor (US-F04), keyboard nav (US-F10),
 * winner + lock UI (US-F07), and CSV import UI.
 */
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createProjectViaUi, makeClient, renderApp } from "./harness";

describe("project selector & app shell (US-F01)", () => {
  it("shows the selector screen when no project is open (AC-F01.1)", () => {
    const { getByRole } = renderApp(makeClient());
    expect(
      getByRole("heading", { name: /tarot socket board/i }),
    ).toBeInTheDocument();
    expect(
      getByRole("form", { name: /create new project/i }),
    ).toBeInTheDocument();
    expect(
      getByRole("form", { name: /open existing project/i }),
    ).toBeInTheDocument();
  });

  it("creates a project and navigates to the grid (AC-F01.2)", async () => {
    const { getByRole } = await createProjectViaUi("My Deck", 6);
    const grid = getByRole("grid");
    expect(grid).toBeInTheDocument();
    expect(grid.querySelectorAll(".socket-card")).toHaveLength(6);
  });

  it("shows a structured error and does NOT navigate on failure (AC-F01.3)", async () => {
    const { getByText, queryByRole, getByRole, getByTestId } =
      renderApp(makeClient());
    const user = userEvent.setup();
    await user.type(getByTestId("project-name-input"), "Bad Deck");
    const countInput = getByTestId("socket-count-input");
    await user.clear(countInput);
    await user.type(countInput, "0");
    await user.click(getByRole("button", { name: /create project/i }));
    await waitFor(() =>
      expect(getByText(/INVALID_SOCKET_COUNT/)).toBeInTheDocument(),
    );
    expect(queryByRole("grid")).not.toBeInTheDocument();
  });
});

describe("socket grid (US-F02)", () => {
  it("renders sockets in position order with the default column count (AC-F02.1)", async () => {
    const { getByRole } = await createProjectViaUi("Deck", 4);
    const grid = getByRole("grid");
    expect(grid).toHaveStyle({ "--cols": "3" });
    expect(grid.querySelectorAll(".socket-card")).toHaveLength(4);
  });

  it("re-flows immediately when column density changes (AC-F02.3)", async () => {
    const { getByRole, container } = await createProjectViaUi("Deck", 4);
    const user = userEvent.setup();
    await user.click(getByRole("button", { name: /2 columns/i }));
    await waitFor(() => {
      const grid = container.querySelector(".socket-grid");
      expect(grid).toHaveStyle({ "--cols": "2" });
    });
    expect(getByRole("button", { name: /2 columns/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("socket card states (US-F03)", () => {
  it("shows an empty-state placeholder for empty sockets (AC-F03.1)", async () => {
    const { getByText } = await createProjectViaUi("Deck", 1);
    expect(getByText(/empty socket/i)).toBeInTheDocument();
  });

  it("shows a lock icon when the socket is locked (AC-F03.3)", async () => {
    const { client, getByRole, container } = await createProjectViaUi(
      "Deck",
      1,
    );
    const p = await client.getProject("/tmp/p");
    await client.setSocketLock({
      project_path: p.path,
      socket_id: p.sockets[0].id,
      locked: true,
    });
    const user = userEvent.setup();
    await user.click(getByRole("button", { name: /close project/i }));
    await user.type(
      getByRole("textbox", { name: /existing project path/i }),
      "/tmp/p",
    );
    await user.click(getByRole("button", { name: /^open$/i }));
    await waitFor(() => expect(getByRole("grid")).toBeInTheDocument());
    expect(container.querySelector(".lock-icon")).toBeInTheDocument();
  });
});

describe("keyboard navigation (US-F10)", () => {
  it("moves focus with arrow keys following the column layout (AC-F10.1)", async () => {
    const { getByRole } = await createProjectViaUi("Deck", 4);
    const grid = getByRole("grid");
    const cards = Array.from(
      grid.querySelectorAll<HTMLElement>(".socket-card"),
    );
    cards[0].focus();
    const user = userEvent.setup();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(cards[1]);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(cards[0]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(cards[3]);
  });

  it("Enter opens the detail panel; Escape closes and returns focus (AC-F10.2)", async () => {
    const { getByRole, queryByRole } = await createProjectViaUi("Deck", 2);
    const grid = getByRole("grid");
    const first = grid.querySelectorAll<HTMLElement>(".socket-card")[0];
    first.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        getByRole("dialog", { name: /socket 1 details/i }),
      ).toBeInTheDocument(),
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        queryByRole("dialog", { name: /socket 1 details/i }),
      ).not.toBeInTheDocument(),
    );
    expect(document.activeElement).toBe(first);
  });
});

describe("metadata editor (US-F04)", () => {
  it("renders exactly the fixed schema fields; status is a select (AC-F04.1/.2)", async () => {
    const { getByRole, getByLabelText } = await createProjectViaUi("Deck", 1);
    getByRole("grid").querySelectorAll<HTMLElement>(".socket-card")[0].click();
    await waitFor(() =>
      expect(
        getByRole("dialog", { name: /socket 1 details/i }),
      ).toBeInTheDocument(),
    );
    expect(getByLabelText(/^status$/i)).toBeInTheDocument();
    expect(getByLabelText(/^medium$/i)).toBeInTheDocument();
    expect(getByLabelText(/tags/i)).toBeInTheDocument();
    expect(getByLabelText(/due date/i)).toBeInTheDocument();
    expect(getByLabelText(/^status$/i).tagName.toLowerCase()).toBe("select");
  });

  it("persists a status change via update_socket (AC-F04.2)", async () => {
    const { client, getByRole, getByLabelText } = await createProjectViaUi(
      "Deck",
      1,
    );
    getByRole("grid").querySelectorAll<HTMLElement>(".socket-card")[0].click();
    await waitFor(() =>
      expect(
        getByRole("dialog", { name: /socket 1 details/i }),
      ).toBeInTheDocument(),
    );
    const user = userEvent.setup();
    await user.selectOptions(getByLabelText(/^status$/i), "done");
    await waitFor(async () => {
      const p = await client.getProject("/tmp/p");
      expect(p.sockets[0].metadata.status).toBe("done");
    });
  });
});

describe("winner & lock UI (US-F07)", () => {
  it("unlock requires confirmation, then unlocks (AC-F07.3)", async () => {
    const { client, getByRole } = await createProjectViaUi("Deck", 1);
    const p = await client.getProject("/tmp/p");
    await client.setSocketLock({
      project_path: p.path,
      socket_id: p.sockets[0].id,
      locked: true,
    });
    const user = userEvent.setup();
    await user.click(getByRole("button", { name: /close project/i }));
    await user.type(
      getByRole("textbox", { name: /existing project path/i }),
      "/tmp/p",
    );
    await user.click(getByRole("button", { name: /^open$/i }));
    await waitFor(() => expect(getByRole("grid")).toBeInTheDocument());
    getByRole("grid").querySelectorAll<HTMLElement>(".socket-card")[0].click();
    await waitFor(() =>
      expect(
        getByRole("dialog", { name: /socket 1 details/i }),
      ).toBeInTheDocument(),
    );
    await user.click(getByRole("button", { name: /^unlock$/i }));
    const confirmDialog = getByRole("dialog", {
      name: /unlock this socket\?/i,
    });
    expect(confirmDialog).toBeInTheDocument();
    const confirmBtn = Array.from(
      confirmDialog.querySelectorAll("button"),
    ).find((b) => /^unlock$/i.test(b.textContent ?? ""));
    expect(confirmBtn).toBeTruthy();
    await user.click(confirmBtn!);
    await waitFor(async () => {
      const fresh = await client.getProject("/tmp/p");
      expect(fresh.sockets[0].locked).toBe(false);
    });
  });
});

describe("work attachment & display (M3: US-F05)", () => {
  it("attaches a file and shows it in the detail panel work list", async () => {
    const { client, getByRole } = await createProjectViaUi("Deck", 2);
    const p = await client.getProject("/tmp/p");
    const socketId = p.sockets[0].id;

    // Register a mock file and attach it via path
    const blob = new Blob(["hello world"], { type: "text/plain" });
    const fakePath = "/tmp/hello.txt";
    client.registerLocalFile(fakePath, blob);
    await client.importDroppedFiles({
      project_path: p.path,
      socket_id: socketId,
      paths: [fakePath],
    });

    // Re-open project to get fresh data
    const user = userEvent.setup();
    await user.click(getByRole("button", { name: /close project/i }));
    await user.type(
      getByRole("textbox", { name: /existing project path/i }),
      "/tmp/p",
    );
    await user.click(getByRole("button", { name: /^open$/i }));
    await waitFor(() => expect(getByRole("grid")).toBeInTheDocument());

    // Open socket detail panel
    getByRole("grid").querySelectorAll<HTMLElement>(".socket-card")[0].click();
    await waitFor(() =>
      expect(
        getByRole("dialog", { name: /socket 1 details/i }),
      ).toBeInTheDocument(),
    );

    // Verify work is displayed
    const panel = getByRole("dialog", { name: /socket 1 details/i });
    expect(panel.querySelector(".work-item")).toBeInTheDocument();
  });

  it('shows "1 work" badge on the card after attaching', async () => {
    const { client, getByRole, container } = await createProjectViaUi(
      "Deck",
      1,
    );
    const p = await client.getProject("/tmp/p");
    const socketId = p.sockets[0].id;

    const blob = new Blob(["data"], { type: "text/plain" });
    const fakePath = "/tmp/data.txt";
    client.registerLocalFile(fakePath, blob);
    await client.importDroppedFiles({
      project_path: p.path,
      socket_id: socketId,
      paths: [fakePath],
    });

    // Re-open to refresh
    const user = userEvent.setup();
    await user.click(getByRole("button", { name: /close project/i }));
    await user.type(
      getByRole("textbox", { name: /existing project path/i }),
      "/tmp/p",
    );
    await user.click(getByRole("button", { name: /^open$/i }));
    await waitFor(() => expect(getByRole("grid")).toBeInTheDocument());

    const badge = container.querySelector(".badge.count");
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toMatch(/1 work/);
  });

  it("rejects attachment to a locked socket", async () => {
    const { client } = await createProjectViaUi("Deck", 1);
    const p = await client.getProject("/tmp/p");
    const socketId = p.sockets[0].id;
    await client.setSocketLock({
      project_path: p.path,
      socket_id: socketId,
      locked: true,
    });

    const blob = new Blob(["data"], { type: "text/plain" });
    const fakePath = "/tmp/locked-test.txt";
    client.registerLocalFile(fakePath, blob);
    const result = await client.importDroppedFiles({
      project_path: p.path,
      socket_id: socketId,
      paths: [fakePath],
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].code).toBe("LOCKED");
  });
});

describe("winner selection on works (M3: US-F07)", () => {
  it("selects a work as winner", async () => {
    const { client } = await createProjectViaUi("Deck", 1);
    const p = await client.getProject("/tmp/p");
    const socketId = p.sockets[0].id;

    // Attach a file
    const blob = new Blob(["image data"], { type: "image/png" });
    const fakePath = "/tmp/card.png";
    client.registerLocalFile(fakePath, blob);
    await client.importDroppedFiles({
      project_path: p.path,
      socket_id: socketId,
      paths: [fakePath],
    });

    // Select as winner
    let fresh = await client.getProject("/tmp/p");
    const workId = fresh.sockets[0].works[0].id;
    await client.selectWinner({
      project_path: p.path,
      socket_id: socketId,
      work_id: workId,
    });

    fresh = await client.getProject("/tmp/p");
    expect(fresh.sockets[0].selected_work_id).toBe(workId);
  });

  it("remove_work returns IS_SELECTED when removing the winner without force", async () => {
    const { client } = await createProjectViaUi("Deck", 1);
    const p = await client.getProject("/tmp/p");
    const socketId = p.sockets[0].id;

    const blob = new Blob(["img"], { type: "image/png" });
    const fakePath = "/tmp/winner.png";
    client.registerLocalFile(fakePath, blob);
    await client.importDroppedFiles({
      project_path: p.path,
      socket_id: socketId,
      paths: [fakePath],
    });

    const fresh = await client.getProject("/tmp/p");
    const workId = fresh.sockets[0].works[0].id;
    await client.selectWinner({
      project_path: p.path,
      socket_id: socketId,
      work_id: workId,
    });

    // Try removing without force
    const removeErr = await client
      .removeWork({
        project_path: p.path,
        socket_id: socketId,
        work_id: workId,
      })
      .catch((e: unknown) => e);
    expect(removeErr).toBeInstanceOf(Error);
    expect((removeErr as { code: string }).code).toBe("IS_SELECTED");
  });

  it("remove_work with force clears the winner and removes", async () => {
    const { client } = await createProjectViaUi("Deck", 1);
    const p = await client.getProject("/tmp/p");
    const socketId = p.sockets[0].id;

    const blob = new Blob(["img"], { type: "image/png" });
    const fakePath = "/tmp/force-remove.png";
    client.registerLocalFile(fakePath, blob);
    await client.importDroppedFiles({
      project_path: p.path,
      socket_id: socketId,
      paths: [fakePath],
    });

    let fresh = await client.getProject("/tmp/p");
    const workId = fresh.sockets[0].works[0].id;
    await client.selectWinner({
      project_path: p.path,
      socket_id: socketId,
      work_id: workId,
    });

    // Remove with force
    await client.removeWork({
      project_path: p.path,
      socket_id: socketId,
      work_id: workId,
      force: true,
    });
    fresh = await client.getProject("/tmp/p");
    expect(fresh.sockets[0].works).toHaveLength(0);
    expect(fresh.sockets[0].selected_work_id).toBeNull();
  });
});

describe("CSV import modal (US-F08)", () => {
  it("opens modal, previews CSV, and completes import", async () => {
    const { client, getByRole, getByLabelText, getByTestId } =
      await createProjectViaUi("Deck", 2);
    const user = userEvent.setup();
    await user.click(getByRole("button", { name: /import csv…/i }));
    expect(
      getByRole("dialog", { name: /import sockets from csv/i }),
    ).toBeInTheDocument();

    const csvContent =
      "title,notes,status\n0 - The Fool,First card,in_progress\nI - The Magician,Second,done";
    const file = new File([csvContent], "cards.csv", { type: "text/csv" });
    const fileInput = getByLabelText(/choose csv file/i);
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(getByTestId("csv-preview-count")).toBeInTheDocument();
    });
    expect(getByTestId("csv-preview-count")).toHaveTextContent(/2 data rows/);

    await user.click(getByRole("button", { name: /import 2 rows/i }));
    await waitFor(() => {
      expect(getByRole("button", { name: /done/i })).toBeInTheDocument();
    });
    await user.click(getByRole("button", { name: /done/i }));

    await waitFor(async () => {
      const p = await client.getProject("/tmp/p");
      expect(p.sockets[0].title).toBe("0 - The Fool");
      expect(p.sockets[0].metadata.status).toBe("in_progress");
      expect(p.sockets[1].title).toBe("I - The Magician");
    });
  });
});

describe("document text extraction display (US-F09)", () => {
  it("displays extracted text in the detail panel", async () => {
    const { client, getByRole } = await createProjectViaUi("Deck", 1);
    const p = await client.getProject("/tmp/p");
    const socketId = p.sockets[0].id;

    const blob = new Blob(["Arcana interpretation notes."], {
      type: "text/plain",
    });
    const fakePath = "/tmp/notes.txt";
    client.registerLocalFile(fakePath, blob);
    await client.importDroppedFiles({
      project_path: p.path,
      socket_id: socketId,
      paths: [fakePath],
    });

    // Re-open project to refresh state
    const user = userEvent.setup();
    await user.click(getByRole("button", { name: /close project/i }));
    await user.type(
      getByRole("textbox", { name: /existing project path/i }),
      "/tmp/p",
    );
    await user.click(getByRole("button", { name: /^open$/i }));
    await waitFor(() => expect(getByRole("grid")).toBeInTheDocument());

    // Open detail panel
    getByRole("grid").querySelectorAll<HTMLElement>(".socket-card")[0].click();
    await waitFor(() =>
      expect(
        getByRole("dialog", { name: /socket 1 details/i }),
      ).toBeInTheDocument(),
    );

    await waitFor(() => {
      const details = document.querySelector("details.extracted");
      expect(details).toBeInTheDocument();
      expect(details?.textContent).toContain("Arcana interpretation notes.");
    });
  });
});
