/**
 * Socket grid with card taxonomy, sub-divisible group filtering,
 * sectioned category view, and Synchronized Counterpart Matrix (US-F02, US-F10).
 *
 * - Renders sockets in position order or filtered by Major/Minor/Suit groups or Custom Dimensions.
 * - View Modes:
 *    1. Standard Grid: 1–4 columns, density selectable.
 *    2. Sectioned: Broken into Major Arcana & Suit sections with headers.
 *    3. Table Matrix: Side-by-side synchronized columns for equal subgroups or custom N×M grids
 *       (e.g., Tarot suits, TCG Factions, Board game stages, Design token variants).
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
import type { MatrixConfig, Project } from "../api/types";
import { useBoard } from "../state/context";
import { CsvImportModal } from "./CsvImportModal";
import { MatrixConfigModal } from "./MatrixConfigModal";
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
  const [matrixConfigOpen, setMatrixConfigOpen] = useState(false);
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
    () => analyzeDeckTaxonomy(project.sockets, project.metadata?.matrix_config),
    [project.sockets, project.metadata?.matrix_config],
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
  }, [focusCard, board]);

  const handleSaveMatrixConfig = async (config: MatrixConfig | undefined) => {
    const currentMeta = project.metadata || {};
    await board.updateProjectMetadata({
      ...currentMeta,
      matrix_config: config,
    });
    if (config) {
      setViewMode("matrix");
      board.pushToast(
        "success",
        `Configured ${config.columns?.length || 4}-column comparative matrix table`,
      );
    } else {
      board.pushToast("info", "Matrix table layout reset to auto-detect");
    }
  };

  // Reorder handlers
  const moveLeft = useCallback(
    async (socketId: string) => {
      const idx = sorted.findIndex((s) => s.id === socketId);
      if (idx <= 0) return;
      const current = sorted[idx];
      const target = sorted[idx - 1];
      if (current.locked || target.locked) {
        board.pushToast("error", "Cannot reorder locked sockets");
        return;
      }
      const newOrder = [...sorted.map((s) => s.id)];
      newOrder[idx] = target.id;
      newOrder[idx - 1] = current.id;
      try {
        await board.client.reorderSockets({
          project_path: project.path,
          ordered_socket_ids: newOrder,
        });
        await board.syncProject();
        setAnnounce(`Moved ${current.title || "socket"} left`);
        requestAnimationFrame(() => focusCard(socketId));
      } catch (e) {
        board.pushToast("error", errorMessage(e));
      }
    },
    [sorted, project.path, board, focusCard],
  );

  const moveRight = useCallback(
    async (socketId: string) => {
      const idx = sorted.findIndex((s) => s.id === socketId);
      if (idx < 0 || idx >= sorted.length - 1) return;
      const current = sorted[idx];
      const target = sorted[idx + 1];
      if (current.locked || target.locked) {
        board.pushToast("error", "Cannot reorder locked sockets");
        return;
      }
      const newOrder = [...sorted.map((s) => s.id)];
      newOrder[idx] = target.id;
      newOrder[idx + 1] = current.id;
      try {
        await board.client.reorderSockets({
          project_path: project.path,
          ordered_socket_ids: newOrder,
        });
        await board.syncProject();
        setAnnounce(`Moved ${current.title || "socket"} right`);
        requestAnimationFrame(() => focusCard(socketId));
      } catch (e) {
        board.pushToast("error", errorMessage(e));
      }
    },
    [sorted, project.path, board, focusCard],
  );

  // Global key navigation within the grid
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
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleWindowKeyDown = (e: globalThis.KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isInput =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable);
      if (isInput) return;

      const activeId =
        active?.getAttribute("data-testid")?.replace("socket-card-", "") ??
        null;

      // Reorder shortcuts
      if (activeId && e.altKey) {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          moveLeft(activeId);
          return;
        }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          moveRight(activeId);
          return;
        }
      }

      // Close modal/panel on Escape
      if (e.key === "Escape" && board.selectedSocketId) {
        e.preventDefault();
        closePanel();
        return;
      }

      // Open detail on Enter/Space
      if (
        activeId &&
        (e.key === "Enter" || e.key === " ") &&
        !board.selectedSocketId
      ) {
        e.preventDefault();
        openSocket(activeId);
        return;
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [board.selectedSocketId, closePanel, openSocket, moveLeft, moveRight]);

  const selected = project.sockets.find((s) => s.id === board.selectedSocketId);

  return (
    <>
      {workspaceMode === "scratchpad" ? (
        <PlanningScratchpad
          project={project}
          onBackToGrid={() => setWorkspaceMode("grid")}
          onSelectSocket={(id) => {
            setWorkspaceMode("grid");
            openSocket(id);
          }}
        />
      ) : (
        <>
          <header className="board-header">
            <div className="board-header-left">
              <button
                className="back-btn"
                onClick={() => board.closeProject()}
                title="Close project and return to selection"
                aria-label="Close project and return to selection"
              >
                ← Back
              </button>
              <h1 className="project-title">{project.name}</h1>
              <span className="socket-count-badge">
                {project.sockets.length} sockets
              </span>
            </div>

            <div className="board-header-right">
              {/* Workspace Mode: Scratchpad vs Grid */}
              <button
                className="scratchpad-toggle-btn"
                onClick={() => setWorkspaceMode("scratchpad")}
                title="Open Bottom-to-Top Planning Scratchpad & Symbolism Matrix"
              >
                🔮 Planning Scratchpad
              </button>

              {/* Column Density (only visible in regular grid mode) */}
              {viewMode !== "matrix" && (
                <div
                  className="density-controls"
                  role="group"
                  aria-label="Grid column density"
                >
                  {[1, 2, 3, 4].map((c) => (
                    <button
                      key={c}
                      className={`density-btn ${cols === c ? "active" : ""}`}
                      onClick={() => board.setGridColumns(c)}
                      aria-pressed={cols === c}
                      aria-label={`${c} columns`}
                      title={`${c} columns`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {/* CSV Import */}
              <button
                onClick={() => board.setCsvImportOpen(true)}
                title="Import sockets from CSV"
                aria-label="Import CSV…"
              >
                📥 Import CSV…
              </button>

              {/* Export CRTCH / Bundle */}
              <button
                onClick={async () => {
                  try {
                    let destPath = "";
                    if (isTauriAvailable()) {
                      const { save } =
                        await import("@tauri-apps/plugin-dialog");
                      const selectedPath = await save({
                        filters: [
                          {
                            name: "Cartouche Project Bundle",
                            extensions: ["crtch", "zip"],
                          },
                        ],
                        defaultPath: `${project.name.toLowerCase().replace(/\s+/g, "_")}.crtch`,
                      });
                      if (!selectedPath) return;
                      destPath = selectedPath;
                    } else {
                      destPath = `${project.path}/../${project.name.toLowerCase().replace(/\s+/g, "_")}.crtch`;
                    }
                    const res = await board.client.exportProject({
                      project_path: project.path,
                      destination_path: destPath,
                    });
                    board.pushToast(
                      "success",
                      `Exported project package (${res.manifest_sha256.slice(0, 8)}…)`,
                    );
                  } catch (err) {
                    board.pushToast("error", errorMessage(err));
                  }
                }}
                title="Export portable .crtch bundle"
              >
                📦 Export
              </button>

              {/* Repair scan */}
              <button
                onClick={async () => {
                  try {
                    const scan = await board.client.repairScan({
                      project_path: project.path,
                    });
                    if (
                      scan.missing_assets.length === 0 &&
                      scan.orphans.length === 0
                    ) {
                      board.pushToast(
                        "success",
                        "Asset integrity verified: 0 missing, 0 orphans",
                      );
                    } else {
                      board.pushToast(
                        "info",
                        `Integrity scan: ${scan.missing_assets.length} missing, ${scan.orphans.length} orphans`,
                      );
                    }
                  } catch (err) {
                    board.pushToast("error", errorMessage(err));
                  }
                }}
                title="Scan assets for missing files or orphans"
              >
                🩺 Verify
              </button>

              {/* Project settings */}
              <button
                onClick={() => setSettingsOpen(true)}
                title="Project Settings, Rights & Legal Metadata"
              >
                ⚙ Settings
              </button>
            </div>
          </header>

          {/* Grouping, Suit Filtering & Matrix View Mode Navigation Bar */}
          <div
            className="taxonomy-bar"
            role="toolbar"
            aria-label="Deck Taxonomy and Views"
          >
            <div
              className="taxonomy-pills-group"
              role="tablist"
              aria-label="Category Filters"
            >
              <button
                className={`filter-pill ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => setActiveFilter("all")}
                role="tab"
                aria-selected={activeFilter === "all"}
              >
                All Deliverables ({project.sockets.length})
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
                    onClick={() => {
                      setActiveFilter("minor");
                      if (viewMode === "matrix") setViewMode("grid");
                    }}
                    role="tab"
                    aria-selected={activeFilter === "minor"}
                  >
                    Minor Arcana ({taxonomy.minorCount})
                  </button>
                </>
              )}

              {/* Render detected suits or custom tag categories */}
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
                    ? `Synchronized comparative table matrix (${taxonomy.matrix.subgroupCount} columns)`
                    : "Table matrix"
                }
              >
                Table Matrix ({taxonomy.matrix.subgroupCount || 4} Cols)
              </button>
              <button
                className="view-mode-btn matrix-config-toggle-btn"
                onClick={() => setMatrixConfigOpen(true)}
                title="Configure custom table columns, rows, and domain presets"
              >
                ⚙ Configure Table
              </button>
            </div>
          </div>

          <div className="board-main">
            <div className="grid-scroll">
              {/* 1. SUIT / COMPARATIVE TABLE MATRIX VIEW */}
              {viewMode === "matrix" && taxonomy.matrix.isAvailable ? (
                <div className="matrix-view-wrapper" onKeyDown={onGridKeyDown}>
                  <div className="matrix-sticky-header-row">
                    <div className="matrix-rank-corner-label">
                      <span>
                        {taxonomy.matrix.activeConfig?.rows?.[0]
                          ? "Stage / Rank"
                          : "Rank / Order"}
                      </span>
                      <button
                        type="button"
                        className="matrix-inline-config-btn"
                        onClick={() => setMatrixConfigOpen(true)}
                        title="Configure Matrix Table Layout"
                      >
                        ⚙ Setup
                      </button>
                    </div>
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
                            ✦ {suit.label} ({suit.count} Deliverables)
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

      {matrixConfigOpen && (
        <MatrixConfigModal
          isOpen={matrixConfigOpen}
          onClose={() => setMatrixConfigOpen(false)}
          project={project}
          onSaveConfig={handleSaveMatrixConfig}
        />
      )}
    </>
  );
}
