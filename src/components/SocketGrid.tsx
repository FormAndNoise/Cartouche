/**
 * Socket grid with card taxonomy, sub-divisible group filtering,
 * sectioned category view, and Synchronized Counterpart Matrix (US-F02, US-F10).
 *
 * - Renders sockets in position order or filtered by Major/Minor/Suit groups.
 * - View Modes:
 *    1. Standard Grid: 1–4 columns, density selectable.
 *    2. Sectioned: Broken into Major Arcana & Suit sections with headers.
 *    3. Suit Matrix: Side-by-side synchronized columns for equal subgroups
 *       (e.g., 4 suits pinned to counterparts scrolling vertically in unison).
 * - Full keyboard traversal (arrow keys, Home, End, Enter/Space, Escape).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Project } from "../api/types";
import { useBoard } from "../state/context";
import { CsvImportModal } from "./CsvImportModal";
import { PlanningScratchpad } from "./PlanningScratchpad";
import { ProjectSettingsModal } from "./ProjectSettingsModal";
import { SocketCard } from "./SocketCard";
import { SocketDetailPanel } from "./SocketDetailPanel";
import { errorMessage } from "../state/helpers";
import { isTauriAvailable } from "../api/tauriClient";
import {
  analyzeDeckTaxonomy,
  getSocketPrimaryGroup,
  getSocketSubgroup,
} from "../lib/grouping";

export function SocketGrid({ project }: { project: Project }) {
  const board = useBoard();
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const lastFocused = useRef<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"grid" | "scratchpad">(
    "grid",
  );

  // Grouping and View Mode State
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "sections" | "matrix">(
    "grid",
  );

  const sorted = useMemo(
    () => [...project.sockets].sort((a, b) => a.position - b.position),
    [project.sockets],
  );
  const cols = Math.min(4, Math.max(1, project.grid_columns));

  const taxonomy = useMemo(
    () => analyzeDeckTaxonomy(project.sockets),
    [project.sockets],
  );

  // Filtered sockets based on active group
  const displaySockets = useMemo(() => {
    if (activeFilter === "all") return sorted;
    if (activeFilter === "major") {
      return sorted.filter((s) => getSocketPrimaryGroup(s) === "major");
    }
    if (activeFilter === "minor") {
      return sorted.filter((s) => getSocketPrimaryGroup(s) === "minor");
    }
    // Specific suit or tag filter
    return sorted.filter((s) => {
      const sub = getSocketSubgroup(s);
      if (sub === activeFilter) return true;
      const tags = (s.metadata.tags || "").toLowerCase();
      return tags.includes(activeFilter.toLowerCase());
    });
  }, [sorted, activeFilter]);

  const focusCard = useCallback((socketId: string) => {
    const el = cardRefs.current.get(socketId);
    if (el) {
      el.focus();
      lastFocused.current = socketId;
    }
  }, []);

  const openSocket = useCallback(
    (socketId: string) => {
      lastFocused.current = socketId;
      board.setSelectedSocket(socketId);
    },
    [board],
  );

  const closePanel = useCallback(() => {
    board.setSelectedSocket(null);
    if (lastFocused.current) focusCard(lastFocused.current);
  }, [board, focusCard]);

  const handleExportCrtch = async () => {
    try {
      let dest: string | null = null;
      if (isTauriAvailable()) {
        try {
          const { save } = await import("@tauri-apps/plugin-dialog");
          dest = await save({
            defaultPath: `${project.name.replace(/[^\w.-]/g, "_")}.crtch`,
            filters: [
              {
                name: "Cartouche Deck Package (*.crtch)",
                extensions: ["crtch"],
              },
            ],
          });
        } catch {
          dest = `${project.path}/${project.name.replace(/[^\w.-]/g, "_")}.crtch`;
        }
      } else {
        dest = `${project.path}/${project.name.replace(/[^\w.-]/g, "_")}.crtch`;
      }
      if (!dest) return;
      const res = await board.client.exportProject({
        project_path: project.path,
        destination_path: dest,
      });
      board.pushToast(
        "info",
        `Exported .crtch package: ${res.path.split(/[\\/]/).pop()}`,
      );
    } catch (e) {
      board.pushToast("error", errorMessage(e));
    }
  };

  const handleExportCsv = async () => {
    try {
      const csv = await board.client.exportCsv(project.path);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `${project.name.replace(/[^\w.-]/g, "_")}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      board.pushToast("info", "CSV exported successfully");
    } catch (e) {
      board.pushToast("error", errorMessage(e));
    }
  };

  /** Map arrow keys onto current active geometry. */
  const onGridKeyDown = (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    const activeId =
      active?.getAttribute("data-testid")?.replace("socket-card-", "") ?? null;
    if (!activeId) return;

    if (viewMode === "matrix" && taxonomy.matrix.isAvailable) {
      const matrix = taxonomy.matrix;
      let targetRow = -1;
      let targetCol = -1;
      for (let r = 0; r < matrix.rows.length; r++) {
        const cIdx = matrix.rows[r].cards.findIndex((c) => c?.id === activeId);
        if (cIdx >= 0) {
          targetRow = r;
          targetCol = cIdx;
          break;
        }
      }
      if (targetRow >= 0 && targetCol >= 0) {
        let nRow = targetRow;
        let nCol = targetCol;
        if (e.key === "ArrowRight")
          nCol = Math.min(matrix.subgroupCount - 1, targetCol + 1);
        else if (e.key === "ArrowLeft") nCol = Math.max(0, targetCol - 1);
        else if (e.key === "ArrowDown")
          nRow = Math.min(matrix.rows.length - 1, targetRow + 1);
        else if (e.key === "ArrowUp") nRow = Math.max(0, targetRow - 1);
        else return;

        const targetCard = matrix.rows[nRow].cards[nCol];
        if (targetCard) {
          e.preventDefault();
          focusCard(targetCard.id);
        }
      }
      return;
    }

    const currentList = displaySockets;
    const idx = currentList.findIndex((s) => s.id === activeId);
    if (idx < 0) return;

    let next = -1;
    switch (e.key) {
      case "ArrowRight":
        next = idx + 1;
        break;
      case "ArrowLeft":
        next = idx - 1;
        break;
      case "ArrowDown":
        next = idx + cols;
        break;
      case "ArrowUp":
        next = idx - cols;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = currentList.length - 1;
        break;
      default:
        return;
    }
    if (next >= 0 && next < currentList.length) {
      e.preventDefault();
      focusCard(currentList[next].id);
      setAnnounce(
        `Socket ${currentList[next].position + 1} of ${currentList.length}`,
      );
    }
  };

  useEffect(() => {
    if (lastFocused.current) {
      /* layout changed */
    }
  }, [cols, viewMode, activeFilter]);

  const selected = board.selectedSocketId
    ? (sorted.find((s) => s.id === board.selectedSocketId) ?? null)
    : null;

  return (
    <>
      <header className="board-header">
        <div className="board-header-title">
          <h1>
            {project.name}
            <span className="path">{project.path}</span>
          </h1>
          {project.metadata?.author && (
            <span className="header-author-badge">
              By {project.metadata.author}
              {project.metadata.edition ? ` · ${project.metadata.edition}` : ""}
            </span>
          )}
        </div>

        {viewMode !== "matrix" && (
          <div
            className="density-control"
            role="group"
            aria-label="Grid column density"
          >
            Columns:
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                aria-pressed={cols === n}
                aria-label={`${n} column${n === 1 ? "" : "s"}`}
                onClick={() => board.setGridColumns(n)}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <div className="header-actions">
          <button
            className={`btn-scratchpad-toggle ${workspaceMode === "scratchpad" ? "active" : ""}`}
            onClick={() =>
              setWorkspaceMode(
                workspaceMode === "scratchpad" ? "grid" : "scratchpad",
              )
            }
            title="Bottom-to-top planning scratchpad & symbolism spreadsheet"
          >
            {workspaceMode === "scratchpad"
              ? "⊞ Deliverable Grid"
              : "✎ Planning Scratchpad"}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Edit Deck Metadata & Rights"
            aria-label="Project Settings"
          >
            ⚙ Settings
          </button>
          <button onClick={handleExportCsv} title="Export CSV catalog">
            Export CSV
          </button>
          <button onClick={() => board.setCsvImportOpen(true)}>
            Import CSV…
          </button>
          <button
            className="btn-crtch"
            onClick={handleExportCrtch}
            title="Export master self-contained .crtch package"
          >
            Export .crtch…
          </button>
          <button onClick={board.closeProject}>Close project</button>
        </div>
      </header>

      {workspaceMode === "scratchpad" ? (
        <div className="board-main scratchpad-mode-main">
          <PlanningScratchpad
            project={project}
            onBackToGrid={() => setWorkspaceMode("grid")}
            onSelectSocket={(id) => openSocket(id)}
          />
          {selected && (
            <SocketDetailPanel socket={selected} onClose={closePanel} />
          )}
        </div>
      ) : (
        <>
          {/* Taxonomy & Group Partitioning Subheader */}
          <div
            className="taxonomy-nav-bar"
            role="navigation"
            aria-label="Deck Groups & View Modes"
          >
            <div
              className="taxonomy-pills-group"
              role="tablist"
              aria-label="Card Category Filters"
            >
              <button
                className={`filter-pill ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => {
                  setActiveFilter("all");
                  if (viewMode === "matrix") setViewMode("grid");
                }}
                role="tab"
                aria-selected={activeFilter === "all"}
              >
                All Cards ({taxonomy.allCount})
              </button>

              {taxonomy.hasMajorMinor && (
                <>
                  <button
                    className={`filter-pill ${activeFilter === "major" ? "active" : ""}`}
                    onClick={() => {
                      setActiveFilter("major");
                      if (viewMode === "matrix") setViewMode("grid");
                    }}
                    role="tab"
                    aria-selected={activeFilter === "major"}
                  >
                    Major Arcana ({taxonomy.majorCount})
                  </button>
                  <button
                    className={`filter-pill ${activeFilter === "minor" ? "active" : ""}`}
                    onClick={() => setActiveFilter("minor")}
                    role="tab"
                    aria-selected={activeFilter === "minor"}
                  >
                    Minor Arcana ({taxonomy.minorCount})
                  </button>
                </>
              )}

              {taxonomy.suits.map((suit) => (
                <button
                  key={suit.id}
                  className={`filter-pill ${activeFilter === suit.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveFilter(suit.id);
                    if (viewMode === "matrix") setViewMode("grid");
                  }}
                  role="tab"
                  aria-selected={activeFilter === suit.id}
                >
                  {suit.label} ({suit.count})
                </button>
              ))}
            </div>

            {/* View Mode Switcher */}
            <div
              className="view-mode-group"
              role="group"
              aria-label="View Layout Mode"
            >
              <button
                className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
                onClick={() => setViewMode("grid")}
                title="Continuous sequential grid view"
              >
                Grid
              </button>
              <button
                className={`view-mode-btn ${viewMode === "sections" ? "active" : ""}`}
                onClick={() => setViewMode("sections")}
                title="Divided by Major Arcana and individual Suits"
              >
                Sectioned
              </button>
              <button
                className={`view-mode-btn ${viewMode === "matrix" ? "active" : ""}`}
                disabled={!taxonomy.matrix.isAvailable}
                onClick={() => setViewMode("matrix")}
                title={
                  taxonomy.matrix.isAvailable
                    ? `Synchronized side-by-side comparison of ${taxonomy.matrix.subgroupCount} suits`
                    : "Suit matrix requires 2 or more evenly divided subgroups"
                }
              >
                Suit Matrix ({taxonomy.matrix.subgroupCount || 4} Suits
                Side-by-Side)
              </button>
            </div>
          </div>

          <div className="board-main">
            <div className="grid-scroll">
              {/* 1. SUIT MATRIX VIEW (Synchronized Counterparts Side-by-Side) */}
              {viewMode === "matrix" && taxonomy.matrix.isAvailable ? (
                <div className="matrix-view-wrapper" onKeyDown={onGridKeyDown}>
                  <div className="matrix-sticky-header-row">
                    <div className="matrix-rank-corner-label">Rank / Order</div>
                    {taxonomy.matrix.columnHeaders.map((hdr, i) => (
                      <div key={i} className="matrix-column-title">
                        {hdr}
                      </div>
                    ))}
                  </div>

                  <div className="matrix-rows-container">
                    {taxonomy.matrix.rows.map((row) => (
                      <div key={row.rankIndex} className="matrix-row-item">
                        <div className="matrix-row-rank-badge">
                          <span>{row.rankLabel}</span>
                        </div>
                        <div
                          className="matrix-row-cards-grid"
                          style={{
                            gridTemplateColumns: `repeat(${taxonomy.matrix.subgroupCount}, minmax(0, 1fr))`,
                          }}
                        >
                          {row.cards.map((s, cIdx) =>
                            s ? (
                              <SocketCard
                                key={s.id}
                                socket={s}
                                onOpen={openSocket}
                                ref={(el) => {
                                  if (el) cardRefs.current.set(s.id, el);
                                  else cardRefs.current.delete(s.id);
                                }}
                              />
                            ) : (
                              <div key={cIdx} className="matrix-empty-slot">
                                —
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : viewMode === "sections" ? (
                /* 2. SECTIONED CATEGORY VIEW */
                <div
                  className="sectioned-view-wrapper"
                  onKeyDown={onGridKeyDown}
                >
                  {taxonomy.hasMajorMinor && taxonomy.majorCount > 0 && (
                    <section className="deck-category-section">
                      <div className="deck-section-divider">
                        <span className="deck-section-title">
                          ◆ Major Arcana ({taxonomy.majorCount} Deliverables)
                        </span>
                        <div className="deck-section-line" />
                      </div>
                      <div
                        className="socket-grid"
                        style={{ ["--cols" as string]: cols }}
                      >
                        {sorted
                          .filter((s) => getSocketPrimaryGroup(s) === "major")
                          .map((s) => (
                            <SocketCard
                              key={s.id}
                              socket={s}
                              onOpen={openSocket}
                              ref={(el) => {
                                if (el) cardRefs.current.set(s.id, el);
                                else cardRefs.current.delete(s.id);
                              }}
                            />
                          ))}
                      </div>
                    </section>
                  )}

                  {taxonomy.suits.length > 0 ? (
                    taxonomy.suits.map((suit) => (
                      <section key={suit.id} className="deck-category-section">
                        <div className="deck-section-divider">
                          <span className="deck-section-title">
                            ✦ Minor Arcana — {suit.label} ({suit.count}{" "}
                            Deliverables)
                          </span>
                          <div className="deck-section-line" />
                        </div>
                        <div
                          className="socket-grid"
                          style={{ ["--cols" as string]: cols }}
                        >
                          {suit.sockets.map((s) => (
                            <SocketCard
                              key={s.id}
                              socket={s}
                              onOpen={openSocket}
                              ref={(el) => {
                                if (el) cardRefs.current.set(s.id, el);
                                else cardRefs.current.delete(s.id);
                              }}
                            />
                          ))}
                        </div>
                      </section>
                    ))
                  ) : (
                    <div
                      className="socket-grid"
                      style={{ ["--cols" as string]: cols }}
                    >
                      {displaySockets.map((s) => (
                        <SocketCard
                          key={s.id}
                          socket={s}
                          onOpen={openSocket}
                          ref={(el) => {
                            if (el) cardRefs.current.set(s.id, el);
                            else cardRefs.current.delete(s.id);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* 3. STANDARD CONTINUOUS GRID VIEW */
                <div
                  ref={gridRef}
                  className="socket-grid"
                  role="grid"
                  aria-label={`Sockets for ${project.name}`}
                  aria-rowcount={Math.ceil(displaySockets.length / cols)}
                  style={{ ["--cols" as string]: cols }}
                  onKeyDown={onGridKeyDown}
                >
                  {displaySockets.map((s) => (
                    <SocketCard
                      key={s.id}
                      socket={s}
                      onOpen={openSocket}
                      ref={(el) => {
                        if (el) cardRefs.current.set(s.id, el);
                        else cardRefs.current.delete(s.id);
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="visually-hidden" role="status" aria-live="polite">
                {announce}
              </div>
            </div>

            {selected && (
              <SocketDetailPanel socket={selected} onClose={closePanel} />
            )}
          </div>
        </>
      )}

      {board.csvImportOpen && (
        <CsvImportModal onClose={() => board.setCsvImportOpen(false)} />
      )}

      {settingsOpen && (
        <ProjectSettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}
