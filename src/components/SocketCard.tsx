/**
 * Socket card (US-F03) with:
 * - Hover information bubble of socket tenant metadata (artist, license, AI policy, tags, status).
 * - Right-click context menu (delete work, toggle lock, clear winner, quick status, copy info).
 * - Drag-and-drop artwork movement between sockets (reassigns artwork without altering socket position or title).
 * - Winner thumbnail display, audition indicators, and keyboard navigation.
 */
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Socket, Work } from "../api/types";
import { useBoard, type AttachableFile } from "../state/context";
import { resolveEffectiveRights } from "../lib/licensing";
import { getSocketPrimaryGroup, getSocketSubgroup } from "../lib/grouping";

function docGlyph(kind: Work["media_kind"]): string {
  switch (kind) {
    case "pdf":
      return "📄";
    case "docx":
      return "📝";
    case "text":
      return "📃";
    default:
      return "🗎";
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SocketCardProps {
  socket: Socket;
  onOpen: (socketId: string) => void;
}

export const SocketCard = forwardRef<HTMLDivElement, SocketCardProps>(
  function SocketCard({ socket, onOpen }, ref) {
    const board = useBoard();
    const [dragOver, setDragOver] = useState(false);
    const [showHoverBubble, setShowHoverBubble] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
    } | null>(null);
    const hoverTimer = useRef<number | null>(null);
    const isAttaching = board.attachingSockets.has(socket.id);

    const winner = socket.selected_work_id
      ? (socket.works.find((w) => w.id === socket.selected_work_id) ?? null)
      : null;
    const activeWork =
      winner ??
      (socket.works.length > 0 ? socket.works[socket.works.length - 1] : null);
    const isEmpty = socket.works.length === 0;

    // Resolve tenant metadata & rights
    const rights = resolveEffectiveRights(socket, board.project);
    const primaryGroup = getSocketPrimaryGroup(socket);
    const subgroup = getSocketSubgroup(socket);

    // Close context menu on outside click or escape
    useEffect(() => {
      if (!contextMenu) return;
      const onGlobalClick = () => setContextMenu(null);
      const onGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
        if (e.key === "Escape") setContextMenu(null);
      };
      window.addEventListener("click", onGlobalClick);
      window.addEventListener("keydown", onGlobalKeyDown);
      return () => {
        window.removeEventListener("click", onGlobalClick);
        window.removeEventListener("keydown", onGlobalKeyDown);
      };
    }, [contextMenu]);

    const handleMouseEnter = () => {
      hoverTimer.current = window.setTimeout(() => {
        setShowHoverBubble(true);
      }, 240);
    };

    const handleMouseLeave = () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setShowHoverBubble(false);
    };

    const handleContextMenu = (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowHoverBubble(false);
      setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleDragStart = (e: DragEvent) => {
      if (socket.locked || !activeWork) return;
      setShowHoverBubble(false);
      e.dataTransfer.setData(
        "application/x-cartouche-work",
        JSON.stringify({
          sourceSocketId: socket.id,
          workId: activeWork.id,
        }),
      );
      e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      if (socket.locked) {
        board.pushToast(
          "error",
          `[LOCKED] Socket "${socket.title || socket.position + 1}" is locked — unlock it to accept modifications.`,
        );
        return;
      }

      // Check if this is an internal artwork move from another socket
      const workData = e.dataTransfer.getData("application/x-cartouche-work");
      if (workData) {
        try {
          const { sourceSocketId, workId } = JSON.parse(workData);
          if (sourceSocketId && workId && sourceSocketId !== socket.id) {
            await board.moveWorkBetweenSockets(
              sourceSocketId,
              socket.id,
              workId,
            );
            return;
          }
        } catch {
          // ignore parse error, fallback to files
        }
      }

      // External file drop
      const files = Array.from(e.dataTransfer.files).map(
        (f): AttachableFile => ({
          name: f.name,
          blob: f,
          path: (f as unknown as { path?: string }).path || undefined,
        }),
      );
      if (files.length > 0) {
        await board.attachFiles(socket.id, files);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(socket.id);
      }
    };

    const setStatus = (
      status: "not_started" | "in_progress" | "needs_review" | "done",
    ) => {
      board.updateSocketFields(socket.id, {
        metadata: { ...socket.metadata, status },
      });
      setContextMenu(null);
    };

    const handleClearWinner = () => {
      board.selectWinner(socket.id, null);
      setContextMenu(null);
    };

    const handleDeleteWinner = () => {
      if (!winner) return;
      board.removeWork(socket.id, winner.id, true);
      setContextMenu(null);
    };

    const handleDeleteAllWorks = async () => {
      if (socket.locked) {
        board.pushToast("error", "Socket is locked.");
        return;
      }
      for (const w of [...socket.works]) {
        try {
          await board.removeWork(socket.id, w.id, true);
        } catch {
          // continue
        }
      }
      setContextMenu(null);
    };

    const handleCopyDetails = () => {
      const details = [
        `Title: ${socket.title || `Socket #${socket.position + 1}`}`,
        `Position: ${socket.position + 1}`,
        `Status: ${socket.metadata.status || "not_started"}`,
        `Author: ${rights.author}`,
        `License: ${rights.license}`,
        socket.metadata.tags ? `Tags: ${socket.metadata.tags}` : null,
        socket.notes ? `Notes: ${socket.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      navigator.clipboard.writeText(details);
      board.pushToast("info", "Card details copied to clipboard");
      setContextMenu(null);
    };

    const statusClass = socket.metadata.status
      ? `status-${socket.metadata.status}`
      : "";

    return (
      <div
        ref={ref}
        className={[
          "socket-card",
          isEmpty ? "empty" : "",
          socket.locked ? "locked" : "",
          dragOver ? "drop-target" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="gridcell"
        tabIndex={0}
        aria-label={`Socket ${socket.position + 1}: ${socket.title || "untitled"}${socket.locked ? ", locked" : ""}${isEmpty ? ", empty" : `, ${socket.works.length} work${socket.works.length === 1 ? "" : "s"}`}`}
        data-testid={`socket-card-${socket.id}`}
        onClick={() => onOpen(socket.id)}
        onKeyDown={onKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="card-top">
          <span className="pos">
            {String(socket.position + 1).padStart(2, "0")}
          </span>
          <span className={`title ${socket.title ? "" : "untitled"}`}>
            {socket.title || "Untitled socket"}
          </span>
          {socket.locked && (
            <span
              className="lock-icon"
              aria-label="Locked"
              title="Locked — artwork is pinned to this socket"
            >
              🔒
            </span>
          )}
        </div>

        <div
          className={`thumb ${!socket.locked && activeWork ? "draggable-thumb" : ""}`}
          draggable={!socket.locked && !!activeWork}
          onDragStart={handleDragStart}
          title={
            !socket.locked && activeWork
              ? "Drag artwork to move to another socket"
              : undefined
          }
        >
          {isAttaching ? (
            <span className="pending" data-testid={`attaching-${socket.id}`}>
              <span className="spinner" aria-hidden="true" /> Attaching…
            </span>
          ) : isEmpty ? (
            <span className="empty-label">
              Empty socket — drop a file or browse
            </span>
          ) : activeWork ? (
            activeWork.preview_uri ? (
              <img
                src={activeWork.preview_uri}
                alt={activeWork.title}
                loading="lazy"
              />
            ) : activeWork.preview_state === "pending" ? (
              <span className="pending">
                <span className="spinner" aria-hidden="true" /> Generating
                preview…
              </span>
            ) : activeWork.media_kind === "image" ? (
              <span className="doc-icon" aria-label="Image unavailable">
                🖼️
              </span>
            ) : (
              <span
                className="doc-icon"
                aria-label={`${activeWork.media_kind} document`}
              >
                {docGlyph(activeWork.media_kind)}
              </span>
            )
          ) : (
            <span className="empty-label">
              {socket.works.length} candidate
              {socket.works.length === 1 ? "" : "s"} — pick a winner
            </span>
          )}
        </div>

        <div className="card-badges">
          {socket.metadata.status &&
            socket.metadata.status !== "not_started" && (
              <span className={`badge ${statusClass}`}>
                {socket.metadata.status.replace("_", " ")}
              </span>
            )}
          {winner ? (
            <span className="badge winner">✓ winner</span>
          ) : socket.works.length > 0 ? (
            <span className="badge audition">auditioning</span>
          ) : null}
          {socket.works.length > 0 && (
            <span className="badge count">
              {socket.works.length} work{socket.works.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* Hover Tenant Information Bubble */}
        {showHoverBubble && !contextMenu && (
          <div
            className="socket-tenant-bubble"
            role="tooltip"
            aria-label="Socket Tenant Information"
          >
            <div className="bubble-header">
              <span className="bubble-pos">#{socket.position + 1}</span>
              <strong className="bubble-title">
                {socket.title || "Untitled Socket"}
              </strong>
              {socket.locked && (
                <span className="bubble-lock-tag">🔒 Locked</span>
              )}
            </div>

            <div className="bubble-meta-grid">
              <div className="bubble-meta-row">
                <span className="bubble-label">Group:</span>
                <span className="bubble-val">
                  {primaryGroup === "major"
                    ? "Major Arcana"
                    : subgroup
                      ? `Minor Arcana (${subgroup})`
                      : "Standard Socket"}
                </span>
              </div>

              <div className="bubble-meta-row">
                <span className="bubble-label">Status:</span>
                <span className="bubble-val bubble-status-val">
                  {socket.metadata.status
                    ? socket.metadata.status.replace("_", " ")
                    : "not started"}
                </span>
              </div>

              <div className="bubble-meta-row">
                <span className="bubble-label">Artist:</span>
                <span className="bubble-val">{rights.author}</span>
              </div>

              <div className="bubble-meta-row">
                <span className="bubble-label">License:</span>
                <span className="bubble-val">{rights.license}</span>
              </div>

              {activeWork && (
                <div className="bubble-meta-row">
                  <span className="bubble-label">Artwork:</span>
                  <span className="bubble-val">
                    {winner ? "✓ " : ""}
                    {activeWork.title}{" "}
                    <span className="bubble-faint">
                      ({formatBytes(activeWork.byte_size)})
                    </span>
                  </span>
                </div>
              )}

              {socket.metadata.tags && (
                <div className="bubble-meta-row">
                  <span className="bubble-label">Tags:</span>
                  <span className="bubble-val">{socket.metadata.tags}</span>
                </div>
              )}

              {socket.notes && (
                <div className="bubble-meta-row bubble-notes-row">
                  <span className="bubble-label">Notes:</span>
                  <span className="bubble-val bubble-notes-val">
                    {socket.notes.length > 80
                      ? `${socket.notes.slice(0, 80)}…`
                      : socket.notes}
                  </span>
                </div>
              )}
            </div>

            <div className="bubble-hint">
              {!socket.locked && activeWork
                ? "⇄ Drag artwork to reassign • Right-click for options"
                : "Right-click for options"}
            </div>
          </div>
        )}

        {/* Right-Click Context Menu */}
        {contextMenu && (
          <div
            className="socket-context-menu"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
            }}
            role="menu"
            aria-label="Socket actions"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="context-menu-header">
              #{socket.position + 1} · {socket.title || "Socket"}
            </div>

            <button
              className="context-menu-item"
              onClick={() => {
                onOpen(socket.id);
                setContextMenu(null);
              }}
              role="menuitem"
            >
              👁 Inspect & Audition…
            </button>

            <button
              className="context-menu-item"
              onClick={() => {
                board.setSocketLock(socket.id, !socket.locked);
                setContextMenu(null);
              }}
              role="menuitem"
            >
              {socket.locked
                ? "🔓 Unlock Socket"
                : "🔒 Lock Socket (Pin Image)"}
            </button>

            <div className="context-menu-separator" />

            <div className="context-menu-submenu-label">Status:</div>
            <div className="context-status-row">
              <button
                className={`context-status-btn ${socket.metadata.status === "not_started" ? "active" : ""}`}
                onClick={() => setStatus("not_started")}
              >
                Not Started
              </button>
              <button
                className={`context-status-btn ${socket.metadata.status === "in_progress" ? "active" : ""}`}
                onClick={() => setStatus("in_progress")}
              >
                In Progress
              </button>
              <button
                className={`context-status-btn ${socket.metadata.status === "needs_review" ? "active" : ""}`}
                onClick={() => setStatus("needs_review")}
              >
                Review
              </button>
              <button
                className={`context-status-btn ${socket.metadata.status === "done" ? "active" : ""}`}
                onClick={() => setStatus("done")}
              >
                Done
              </button>
            </div>

            {activeWork && (
              <>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    board.openInExternalEditor(socket.id, activeWork.id);
                    setContextMenu(null);
                  }}
                  role="menuitem"
                  title="Open file in OS default editor (Photoshop, Affinity, GIMP, Paint...)"
                >
                  🖌 Edit in External App…
                </button>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    board.syncExternalEdits(socket.id, activeWork.id);
                    setContextMenu(null);
                  }}
                  role="menuitem"
                  title="Detect modifications on disk and record cryptographic SHA-256 state into forensic ledger"
                >
                  🔄 Sync External Edits
                </button>
              </>
            )}

            <div className="context-menu-separator" />

            {winner && (
              <button
                className="context-menu-item"
                onClick={handleClearWinner}
                role="menuitem"
              >
                ✕ Clear Winner Choice
              </button>
            )}

            {activeWork && (
              <button
                className="context-menu-item danger"
                onClick={handleDeleteWinner}
                role="menuitem"
              >
                🗑 Delete Active Image
              </button>
            )}

            {socket.works.length > 1 && (
              <button
                className="context-menu-item danger"
                onClick={handleDeleteAllWorks}
                role="menuitem"
              >
                🗑 Remove All {socket.works.length} Works
              </button>
            )}

            <button
              className="context-menu-item"
              onClick={handleCopyDetails}
              role="menuitem"
            >
              📋 Copy Card Metadata
            </button>
          </div>
        )}
      </div>
    );
  },
);
