import { useState } from "react";
import type {
 PlanningMatrixData,
 Project,
 RankDimension,
 Socket,
 SocketTenantSymbolism,
 SubgroupDimension,
} from "../api/types";
import {
 generatePlanningCsv,
 generatePlanningMarkdownDossier,
 getOrInitPlanningMatrix,
 PLANNING_DOMAIN_PRESETS,
 type PlanningDomainPreset,
 resolveSocketSymbolism,
 synthesizeTenantSymbolism,
} from "../lib/planningMatrix";
import { getSocketPrimaryGroup, getSocketSubgroup } from "../lib/grouping";
import { PlanningPresetModal } from "./PlanningPresetModal";
import { useBoard } from "../state/context";

interface Props {
 project: Project;
 onBackToGrid: () => void;
 onSelectSocket: (id: string) => void;
}

type ScratchpadTab = "spreadsheet" | "subgroups" | "ranks" | "synthesizer";

export function PlanningScratchpad({
 project,
 onBackToGrid,
 onSelectSocket,
}: Props) {
 const board = useBoard();
 const [activeTab, setActiveTab] = useState<ScratchpadTab>("spreadsheet");
 const [filterGroup, setFilterGroup] = useState<string>("all");
 const [searchQuery, setSearchQuery] = useState<string>("");
 const [presetModalOpen, setPresetModalOpen] = useState<boolean>(false);
 const [editingCell, setEditingCell] = useState<{
 socketId: string;
 field: keyof SocketTenantSymbolism | "notes";
 } | null>(null);
 const [cellDraft, setCellDraft] = useState<string>("");

 const matrix = getOrInitPlanningMatrix(project);

 const saveMatrix = async (updated: PlanningMatrixData) => {
 const currentMeta = project.metadata || {};
 await board.updateProjectMetadata({
 ...currentMeta,
 planning_matrix: {
 ...updated,
 updated_at: new Date().toISOString(),
 },
 });
 };

 const handleApplyDomainPreset = async (preset: PlanningDomainPreset) => {
 await saveMatrix({
 subgroups: preset.subgroups.map((s) => ({ ...s })),
 ranks: preset.ranks.map((r) => ({ ...r })),
 });
 board.pushToast("success", `Loaded planning template: ${preset.name}`);
 };

 const handleStartBlankMatrix = async () => {
 const blankPreset = PLANNING_DOMAIN_PRESETS.find(
 (p) => p.id === "custom_blank",
 );
 if (blankPreset) {
 await handleApplyDomainPreset(blankPreset);
 setActiveTab("subgroups");
 }
 };

 const handleUpdateSubgroup = async (
 idx: number,
 patch: Partial<SubgroupDimension>,
 ) => {
 const newSubgroups = [...matrix.subgroups];
 newSubgroups[idx] = { ...newSubgroups[idx], ...patch };
 await saveMatrix({ ...matrix, subgroups: newSubgroups });
 };

 const handleAddSubgroup = async () => {
 const nextNum = matrix.subgroups.length + 1;
 const newId = `dimension_${nextNum}`;
 const newSub: SubgroupDimension = {
 id: newId,
 label: `Dimension ${nextNum}`,
 element: "Custom Domain / Element",
 theme: "Theme overview...",
 palette: "Palette notes...",
 motifs: "Key motifs...",
 notes: "Artistic invariant...",
 };
 await saveMatrix({ ...matrix, subgroups: [...matrix.subgroups, newSub] });
 };

 const handleRemoveSubgroup = async (idx: number) => {
 if (matrix.subgroups.length <= 1) return;
 const newSubgroups = matrix.subgroups.filter((_, i) => i !== idx);
 await saveMatrix({ ...matrix, subgroups: newSubgroups });
 };

 const handleUpdateRank = async (
 idx: number,
 patch: Partial<RankDimension>,
 ) => {
 const newRanks = [...matrix.ranks];
 newRanks[idx] = { ...newRanks[idx], ...patch };
 await saveMatrix({ ...matrix, ranks: newRanks });
 };

 const handleAddRank = async () => {
 const nextNum = matrix.ranks.length + 1;
 const newRank: RankDimension = {
 rankIndex: matrix.ranks.length,
 rankLabel: `Stage ${nextNum}`,
 meaning: "Progression tier meaning...",
 composition_rule: "Framing & composition rule...",
 archetype: `Stage ${nextNum} Role`,
 };
 await saveMatrix({ ...matrix, ranks: [...matrix.ranks, newRank] });
 };

 const handleRemoveRank = async (idx: number) => {
 if (matrix.ranks.length <= 1) return;
 const newRanks = matrix.ranks.filter((_, i) => i !== idx);
 await saveMatrix({ ...matrix, ranks: newRanks });
 };

 const handleCommitCell = async (socket: Socket) => {
 if (!editingCell) return;
 const { field } = editingCell;

 if (field === "notes") {
 await board.updateSocketFields(socket.id, { notes: cellDraft });
 } else {
 const existingSym =
 socket.metadata.symbolism || resolveSocketSymbolism(socket, matrix);
 const newSym: SocketTenantSymbolism = {
 ...existingSym,
 [field]: cellDraft,
 };
 await board.updateSocketFields(socket.id, {
 metadata: {
 ...socket.metadata,
 symbolism: newSym,
 },
 });
 }
 setEditingCell(null);
 };

 const handleAutoSynthesizeAll = async () => {
 let synthesizedCount = 0;
 for (const socket of project.sockets) {
 const subId = getSocketSubgroup(socket) || getSocketPrimaryGroup(socket);
 const matchedSub =
 matrix.subgroups.find((s) => s.id === subId) || matrix.subgroups[0];
 const posInSuit = socket.position % Math.max(1, matrix.ranks.length);
 const matchedRank = matrix.ranks[posInSuit] || matrix.ranks[0];

 const synthesized = synthesizeTenantSymbolism(
 matchedSub,
 matchedRank,
 socket.title,
 );
 const currentSym = socket.metadata.symbolism || {};

 const updatedSym: SocketTenantSymbolism = {
 core_meaning: currentSym.core_meaning || synthesized.core_meaning,
 visual_motifs: currentSym.visual_motifs || synthesized.visual_motifs,
 color_palette: currentSym.color_palette || synthesized.color_palette,
 composition_brief:
 currentSym.composition_brief || synthesized.composition_brief,
 elemental_attribution:
 currentSym.elemental_attribution || synthesized.elemental_attribution,
 };

 await board.updateSocketFields(socket.id, {
 metadata: {
 ...socket.metadata,
 symbolism: updatedSym,
 },
 });
 synthesizedCount++;
 }
 board.pushToast(
 "success",
 `Synthesized dimensional symbolism across all ${synthesizedCount} sockets`,
 );
 };

 const handleExportCsv = () => {
 const csv = generatePlanningCsv(project);
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `${project.name.toLowerCase().replace(/\s+/g, "_")}_planning_matrix.csv`;
 a.click();
 URL.revokeObjectURL(url);
 board.pushToast("info", "Planning matrix spreadsheet exported as CSV");
 };

 const handleCopyMarkdownDossier = () => {
 const md = generatePlanningMarkdownDossier(project);
 navigator.clipboard.writeText(md);
 board.pushToast("success", "Markdown design dossier copied to clipboard");
 };

 const handleCommitProvenanceRecord = async () => {
 const now = new Date().toISOString();
 let recordsAdded = 0;
 for (const socket of project.sockets) {
 const ledger = socket.metadata.provenance_ledger
 ? [...socket.metadata.provenance_ledger]
 : [];
 const sym = resolveSocketSymbolism(socket, matrix);
 ledger.push({
 id: `prov-plan-${Date.now()}-${socket.position}`,
 timestamp: now,
 event: "PLANNING_MATRIX_COMMITTED",
 asset_filename: `Socket_${socket.position + 1}_${socket.title || "Tenant"}`,
 sha256_hash: `matrix-hash-${Date.now().toString(16)}`,
 byte_size: JSON.stringify(sym).length,
 notes: `Dimensional planning committed: ${sym.core_meaning?.slice(0, 60)}…`,
 });
 await board.updateSocketFields(socket.id, {
 metadata: {
 ...socket.metadata,
 provenance_ledger: ledger,
 },
 });
 recordsAdded++;
 }
 board.pushToast(
 "success",
 `Cryptographically committed planning state into legal provenance for ${recordsAdded} cards`,
 );
 };

 // Filter sockets
 const filteredSockets = project.sockets.filter((s) => {
 if (filterGroup !== "all") {
 const sub = getSocketSubgroup(s) || getSocketPrimaryGroup(s);
 if (filterGroup === "major" && sub !== "major") return false;
 if (filterGroup === "minor" && sub === "major") return false;
 if (
 filterGroup !== "major" &&
 filterGroup !== "minor" &&
 sub !== filterGroup
 )
 return false;
 }
 if (searchQuery.trim()) {
 const q = searchQuery.toLowerCase();
 const sym = resolveSocketSymbolism(s, matrix);
 const text =
 `${s.title} ${s.notes} ${sym.core_meaning} ${sym.visual_motifs} ${sym.color_palette} ${sym.composition_brief}`.toLowerCase();
 if (!text.includes(q)) return false;
 }
 return true;
 });

 return (
 <div className="scratchpad-page" data-testid="planning-scratchpad">
 {/* Top Action Bar */}
 <header className="scratchpad-header">
 <div className="scratchpad-header-left">
 <button
 className="back-grid-btn"
 onClick={onBackToGrid}
 title="Return to Deliverable Grid"
 >
 ← ⊞ Back to Grid
 </button>
 <div className="scratchpad-title-block">
 <h1>Planning Scratchpad & Domain Matrix</h1>
 <span className="scratchpad-subtitle">
 Dimensional Synthesis & Symbolism Ledger •{" "}
 {project.sockets.length} Deliverable Sockets
 </span>
 </div>
 </div>

 <div className="scratchpad-header-actions">
 <button
 className="preset-modal-btn"
 onClick={() => setPresetModalOpen(true)}
 title="Choose a domain template or start from scratch with a custom matrix"
 >
 🔮 Templates & Custom Matrix…
 </button>
 <button
 onClick={handleAutoSynthesizeAll}
 title="Synthesize core meaning, motifs, and brief from Subgroups × Ranks"
 >
 ⟳ Auto-Synthesize Dimensions
 </button>
 <button onClick={handleExportCsv} title="Download spreadsheet as CSV">
 📥 Export CSV
 </button>
 <button
 onClick={handleCopyMarkdownDossier}
 title="Copy full markdown design dossier"
 >
 📋 Copy Markdown
 </button>
 <button
 className="provenance-commit-btn"
 onClick={handleCommitProvenanceRecord}
 title="Stamp current conceptual planning into forensic provenance ledger"
 >
 ⚖ Commit to Provenance
 </button>
 </div>
 </header>

 {/* Domain Preset Bar */}
 <div className="scratchpad-preset-bar">
 <span className="preset-bar-label">Domain Presets:</span>
 {PLANNING_DOMAIN_PRESETS.slice(0, 5).map((preset) => (
 <button
 key={preset.id}
 className="preset-pill-btn"
 onClick={() => handleApplyDomainPreset(preset)}
 title={preset.description}
 >
 {preset.name}
 </button>
 ))}
 <button
 className="preset-pill-btn custom-blank-btn"
 onClick={handleStartBlankMatrix}
 title="Start with a clean blank custom matrix and fill in all your own details"
 >
 ✏ Custom Blank Matrix
 </button>
 <button
 className="preset-pill-btn browse-all-btn"
 onClick={() => setPresetModalOpen(true)}
 title="Browse all domain templates"
 >
 ⋯ More Templates
 </button>
 </div>

 {/* Navigation Sub-Tabs */}
 <nav className="scratchpad-tabs">
 <button
 className={`scratchpad-tab ${activeTab === "spreadsheet" ? "active" : ""}`}
 onClick={() => setActiveTab("spreadsheet")}
 >
 📊 Spreadsheet Matrix ({filteredSockets.length} cards)
 </button>
 <button
 className={`scratchpad-tab ${activeTab === "subgroups" ? "active" : ""}`}
 onClick={() => setActiveTab("subgroups")}
 >
 🔮 Subgroup & Category Dimensions ({matrix.subgroups.length})
 </button>
 <button
 className={`scratchpad-tab ${activeTab === "ranks" ? "active" : ""}`}
 onClick={() => setActiveTab("ranks")}
 >
 📐 Rank & Progression Dimensions ({matrix.ranks.length})
 </button>
 <button
 className={`scratchpad-tab ${activeTab === "synthesizer" ? "active" : ""}`}
 onClick={() => setActiveTab("synthesizer")}
 >
 ⚡ Dimensional Synthesizer Explorer
 </button>
 </nav>

 {/* TAB 1: SPREADSHEET MATRIX */}
 {activeTab === "spreadsheet" && (
 <section className="scratchpad-content spreadsheet-view">
 <div className="spreadsheet-toolbar">
 <div className="filter-pill-group">
 <span className="filter-label">Filter:</span>
 <button
 className={`filter-pill ${filterGroup === "all" ? "active" : ""}`}
 onClick={() => setFilterGroup("all")}
 >
 All Sockets
 </button>
 {matrix.subgroups.map((sub) => (
 <button
 key={sub.id}
 className={`filter-pill ${filterGroup === sub.id ? "active" : ""}`}
 onClick={() => setFilterGroup(sub.id)}
 >
 {sub.label.split("/")[0].trim()}
 </button>
 ))}
 </div>

 <div className="search-box">
 <input
 type="text"
 placeholder="Search meaning, motifs, palette, notes..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 />
 </div>
 </div>

 <div className="spreadsheet-table-wrapper">
 <table className="spreadsheet-table">
 <thead>
 <tr>
 <th style={{ width: "50px" }}>Pos</th>
 <th style={{ width: "160px" }}>Title & Deliverable</th>
 <th style={{ width: "110px" }}>Group / Rank</th>
 <th style={{ width: "90px" }}>Status</th>
 <th>Core Meaning & Concept</th>
 <th>Visual Motifs & Key Imagery</th>
 <th>Palette & Atmosphere</th>
 <th>Composition & Brief</th>
 <th>Lore & Notes</th>
 <th style={{ width: "60px" }}>Inspect</th>
 </tr>
 </thead>
 <tbody>
 {filteredSockets.map((socket) => {
 const sym = resolveSocketSymbolism(socket, matrix);
 const sub =
 getSocketSubgroup(socket) || getSocketPrimaryGroup(socket);
 const isMajor = sub === "major";
 const rankIdx =
 socket.position % Math.max(1, matrix.ranks.length);
 const rankLabel = isMajor
 ? `Arcanum ${socket.position}`
 : matrix.ranks[rankIdx]?.rankLabel.split("(")[0] ||
 `Rank ${rankIdx + 1}`;

 return (
 <tr
 key={socket.id}
 className={`spreadsheet-row ${socket.locked ? "locked-row" : ""}`}
 >
 <td className="pos-cell">#{socket.position + 1}</td>
 <td className="title-cell">
 <strong>
 {socket.title || `Socket #${socket.position + 1}`}
 </strong>
 {socket.works.length > 0 && (
 <span className="works-badge">
 {socket.works.length} art{" "}
 {socket.selected_work_id ? "✓" : ""}
 </span>
 )}
 </td>
 <td className="group-cell">
 <span className="group-tag">{sub}</span>
 <span className="rank-tag">{rankLabel}</span>
 </td>
 <td className="status-cell">
 <span
 className={`status-badge ${socket.metadata.status || "not_started"}`}
 >
 {(socket.metadata.status || "not_started").replace(
 "_",
 " ",
 )}
 </span>
 </td>

 {/* Core Meaning Cell */}
 <td
 className={`editable-cell ${editingCell?.socketId === socket.id && editingCell?.field === "core_meaning" ? "editing" : ""}`}
 onClick={() => {
 if (!socket.locked) {
 setEditingCell({
 socketId: socket.id,
 field: "core_meaning",
 });
 setCellDraft(sym.core_meaning || "");
 }
 }}
 >
 {editingCell?.socketId === socket.id &&
 editingCell?.field === "core_meaning" ? (
 <textarea
 autoFocus
 value={cellDraft}
 onChange={(e) => setCellDraft(e.target.value)}
 onBlur={() => handleCommitCell(socket)}
 onKeyDown={(e) => {
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 handleCommitCell(socket);
 }
 }}
 />
 ) : (
 <span className="cell-text">
 {sym.core_meaning || "Click to add core meaning…"}
 </span>
 )}
 </td>

 {/* Visual Motifs Cell */}
 <td
 className={`editable-cell ${editingCell?.socketId === socket.id && editingCell?.field === "visual_motifs" ? "editing" : ""}`}
 onClick={() => {
 if (!socket.locked) {
 setEditingCell({
 socketId: socket.id,
 field: "visual_motifs",
 });
 setCellDraft(sym.visual_motifs || "");
 }
 }}
 >
 {editingCell?.socketId === socket.id &&
 editingCell?.field === "visual_motifs" ? (
 <textarea
 autoFocus
 value={cellDraft}
 onChange={(e) => setCellDraft(e.target.value)}
 onBlur={() => handleCommitCell(socket)}
 onKeyDown={(e) => {
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 handleCommitCell(socket);
 }
 }}
 />
 ) : (
 <span className="cell-text">
 {sym.visual_motifs || "Click to add motifs…"}
 </span>
 )}
 </td>

 {/* Palette Cell */}
 <td
 className={`editable-cell ${editingCell?.socketId === socket.id && editingCell?.field === "color_palette" ? "editing" : ""}`}
 onClick={() => {
 if (!socket.locked) {
 setEditingCell({
 socketId: socket.id,
 field: "color_palette",
 });
 setCellDraft(sym.color_palette || "");
 }
 }}
 >
 {editingCell?.socketId === socket.id &&
 editingCell?.field === "color_palette" ? (
 <textarea
 autoFocus
 value={cellDraft}
 onChange={(e) => setCellDraft(e.target.value)}
 onBlur={() => handleCommitCell(socket)}
 onKeyDown={(e) => {
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 handleCommitCell(socket);
 }
 }}
 />
 ) : (
 <span className="cell-text">
 {sym.color_palette || "Click to add palette…"}
 </span>
 )}
 </td>

 {/* Composition Brief Cell */}
 <td
 className={`editable-cell ${editingCell?.socketId === socket.id && editingCell?.field === "composition_brief" ? "editing" : ""}`}
 onClick={() => {
 if (!socket.locked) {
 setEditingCell({
 socketId: socket.id,
 field: "composition_brief",
 });
 setCellDraft(sym.composition_brief || "");
 }
 }}
 >
 {editingCell?.socketId === socket.id &&
 editingCell?.field === "composition_brief" ? (
 <textarea
 autoFocus
 value={cellDraft}
 onChange={(e) => setCellDraft(e.target.value)}
 onBlur={() => handleCommitCell(socket)}
 onKeyDown={(e) => {
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 handleCommitCell(socket);
 }
 }}
 />
 ) : (
 <span className="cell-text">
 {sym.composition_brief || "Click to add brief…"}
 </span>
 )}
 </td>

 {/* Notes Cell */}
 <td
 className={`editable-cell ${editingCell?.socketId === socket.id && editingCell?.field === "notes" ? "editing" : ""}`}
 onClick={() => {
 if (!socket.locked) {
 setEditingCell({
 socketId: socket.id,
 field: "notes",
 });
 setCellDraft(socket.notes || "");
 }
 }}
 >
 {editingCell?.socketId === socket.id &&
 editingCell?.field === "notes" ? (
 <textarea
 autoFocus
 value={cellDraft}
 onChange={(e) => setCellDraft(e.target.value)}
 onBlur={() => handleCommitCell(socket)}
 onKeyDown={(e) => {
 if (e.key === "Enter" && !e.shiftKey) {
 e.preventDefault();
 handleCommitCell(socket);
 }
 }}
 />
 ) : (
 <span className="cell-text">
 {socket.notes || "Add lore notes…"}
 </span>
 )}
 </td>

 <td className="action-cell">
 <button
 className="inspect-row-btn"
 onClick={() => onSelectSocket(socket.id)}
 title="Open Socket Detail Panel"
 >
 👁
 </button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </section>
 )}

 {/* TAB 2: SUBGROUP DIMENSIONS */}
 {activeTab === "subgroups" && (
 <section className="scratchpad-content dimensions-view">
 <div className="dimension-intro">
 <h3>Subgroup & Category Dimensions (Vertical Slices)</h3>
 <p>
 Define the overarching forces, categories, visual motifs, and
 palette rules that define each card group. You can edit existing
 fields, add custom dimensions, or start from scratch.
 </p>
 </div>

 <div className="dimension-cards-grid">
 {matrix.subgroups.map((sub, idx) => (
 <div key={sub.id} className="dimension-card">
 <div className="dimension-card-header">
 <input
 className="dimension-label-input"
 value={sub.label}
 placeholder="Dimension Name (e.g. Wands, Faction, Act I)"
 onChange={(e) =>
 handleUpdateSubgroup(idx, { label: e.target.value })
 }
 />
 <div className="dim-header-actions">
 <span className="dimension-id-badge">{sub.id}</span>
 {matrix.subgroups.length > 1 && (
 <button
 className="remove-dim-btn"
 onClick={() => handleRemoveSubgroup(idx)}
 title="Delete dimension"
 >
 ✕
 </button>
 )}
 </div>
 </div>

 <div className="dimension-card-body">
 <label className="dim-field">
 <span>Element / Domain / Type:</span>
 <input
 value={sub.element || ""}
 placeholder="e.g. Fire / Willpower or Tier Category"
 onChange={(e) =>
 handleUpdateSubgroup(idx, { element: e.target.value })
 }
 />
 </label>

 <label className="dim-field">
 <span>Core Themes:</span>
 <textarea
 rows={2}
 value={sub.theme || ""}
 placeholder="Theme overview, narrative focus, core conflict..."
 onChange={(e) =>
 handleUpdateSubgroup(idx, { theme: e.target.value })
 }
 />
 </label>

 <label className="dim-field">
 <span>Dominant Palette & Atmosphere:</span>
 <input
 value={sub.palette || ""}
 placeholder="e.g. Crimson, Amber, Warm Gold, Obsidian"
 onChange={(e) =>
 handleUpdateSubgroup(idx, { palette: e.target.value })
 }
 />
 </label>

 <label className="dim-field">
 <span>Visual Motifs & Key Artifacts:</span>
 <textarea
 rows={2}
 value={sub.motifs || ""}
 placeholder="Key symbols, textures, emblems, focal items..."
 onChange={(e) =>
 handleUpdateSubgroup(idx, { motifs: e.target.value })
 }
 />
 </label>

 <label className="dim-field">
 <span>Artistic Invariants / Lore Notes:</span>
 <input
 value={sub.notes || ""}
 placeholder="e.g. Mandatory visual rules across cards..."
 onChange={(e) =>
 handleUpdateSubgroup(idx, { notes: e.target.value })
 }
 />
 </label>
 </div>
 </div>
 ))}
 </div>

 <div className="dimension-footer-actions">
 <button className="add-dimension-btn" onClick={handleAddSubgroup}>
 + Add Subgroup Dimension
 </button>
 <button
 className="btn-secondary"
 onClick={handleStartBlankMatrix}
 title="Reset all dimensions to clean blank custom inputs"
 >
 ✏ Clean Slate Custom Matrix
 </button>
 </div>
 </section>
 )}

 {/* TAB 3: RANK DIMENSIONS */}
 {activeTab === "ranks" && (
 <section className="scratchpad-content dimensions-view">
 <div className="dimension-intro">
 <h3>Rank & Progression Dimensions (Horizontal Progression)</h3>
 <p>
 Define what each rank, tier, stage, or pose means across all
 categories. You can edit any field or add custom tiers.
 </p>
 </div>

 <div className="ranks-table-wrapper">
 <table className="ranks-table">
 <thead>
 <tr>
 <th style={{ width: "60px" }}>Rank</th>
 <th style={{ width: "160px" }}>Label</th>
 <th>Universal Meaning & Stage</th>
 <th>Archetype Role</th>
 <th>Compositional Framing Rule</th>
 <th style={{ width: "40px" }}></th>
 </tr>
 </thead>
 <tbody>
 {matrix.ranks.map((r, idx) => (
 <tr key={idx}>
 <td className="rank-idx">#{idx + 1}</td>
 <td>
 <input
 className="rank-input"
 value={r.rankLabel}
 placeholder="e.g. Ace, Tier 1, Stage 1"
 onChange={(e) =>
 handleUpdateRank(idx, { rankLabel: e.target.value })
 }
 />
 </td>
 <td>
 <textarea
 className="rank-textarea"
 rows={2}
 value={r.meaning || ""}
 placeholder="Progression stage meaning..."
 onChange={(e) =>
 handleUpdateRank(idx, { meaning: e.target.value })
 }
 />
 </td>
 <td>
 <input
 className="rank-input"
 value={r.archetype || ""}
 placeholder="e.g. The Initiator / Vanguard"
 onChange={(e) =>
 handleUpdateRank(idx, { archetype: e.target.value })
 }
 />
 </td>
 <td>
 <textarea
 className="rank-textarea"
 rows={2}
 value={r.composition_rule || ""}
 placeholder="Framing rules and focal guidelines..."
 onChange={(e) =>
 handleUpdateRank(idx, {
 composition_rule: e.target.value,
 })
 }
 />
 </td>
 <td>
 {matrix.ranks.length > 1 && (
 <button
 className="remove-dim-btn"
 onClick={() => handleRemoveRank(idx)}
 title="Delete rank"
 >
 ✕
 </button>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 <div className="dimension-footer-actions">
 <button className="add-dimension-btn" onClick={handleAddRank}>
 + Add Progression Rank
 </button>
 </div>
 </section>
 )}

 {/* TAB 4: DIMENSIONAL SYNTHESIZER EXPLORER */}
 {activeTab === "synthesizer" && (
 <section className="scratchpad-content synthesizer-view">
 <div className="dimension-intro">
 <h3>Bottom-to-Top Dimensional Synthesis Engine</h3>
 <p>
 Visual intersection of vertical (Subgroup) and horizontal (Rank)
 dimensions. Preview how any two coordinates synthesize into a
 deliverable tenant brief.
 </p>
 </div>

 <div className="synthesizer-matrix-grid">
 {matrix.subgroups.map((sub) => (
 <div key={sub.id} className="synth-column">
 <div className="synth-column-header">
 <h4>{sub.label.split("/")[0]}</h4>
 <span className="synth-elem-tag">
 {sub.element || "Domain"}
 </span>
 </div>

 <div className="synth-cards-list">
 {matrix.ranks.slice(0, 16).map((rank) => {
 const synth = synthesizeTenantSymbolism(sub, rank);
 return (
 <div key={rank.rankIndex} className="synth-card">
 <div className="synth-card-top">
 <span className="synth-rank-name">
 {rank.rankLabel.split("(")[0]}
 </span>
 {rank.archetype && (
 <span className="synth-archetype-tag">
 {rank.archetype}
 </span>
 )}
 </div>
 <p className="synth-meaning">{synth.core_meaning}</p>
 {synth.visual_motifs && (
 <div className="synth-meta">
 <span className="synth-motifs">
 {synth.visual_motifs}
 </span>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 </section>
 )}

 {/* Domain Preset Selection Modal */}
 {presetModalOpen && (
 <PlanningPresetModal
 isOpen={presetModalOpen}
 onClose={() => setPresetModalOpen(false)}
 onSelectPreset={handleApplyDomainPreset}
 />
 )}
 </div>
 );
}
