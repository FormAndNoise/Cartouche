/**
 * Project Settings & Metadata Modal.
 *
 * Allows visual artists to configure deck-level authorship, copyright,
 * license presets (Commercial, PLUS, Creative Commons), AI scraping policy,
 * trademark, edition, description, grid columns, and project name.
 */
import { useState, type FormEvent } from "react";
import { useBoard } from "../state/context";
import { emptyProjectMetadata, type ProjectMetadata } from "../api/types";
import { errorMessage } from "../state/helpers";
import { Modal } from "./Modal";
import {
 LICENSE_PRESETS,
 AI_TRAINING_POLICIES,
 formatRightsSummary,
 generateRightsManifestMarkdown,
 downloadTextFile,
} from "../lib/licensing";

export function ProjectSettingsModal({ onClose }: { onClose: () => void }) {
 const board = useBoard();
 const project = board.project;

 const [name, setName] = useState(project?.name ?? "");
 const [gridColumns, setGridColumns] = useState(project?.grid_columns ?? 3);
 const [meta, setMeta] = useState<ProjectMetadata>(
 project?.metadata ?? emptyProjectMetadata(),
 );
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);

 if (!project) return null;

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 if (!name.trim()) {
 setError("Project name cannot be empty");
 return;
 }
 setError(null);
 setBusy(true);
 try {
 await board.client.updateProject({
 project_path: project.path,
 name: name.trim(),
 grid_columns: gridColumns,
 metadata: meta,
 });
 await board.syncProject();
 board.pushToast("info", "Project settings updated");
 onClose();
 } catch (err) {
 setError(errorMessage(err));
 } finally {
 setBusy(false);
 }
 };

 const handleExportManifest = () => {
 const updatedProject = {
 ...project,
 name,
 grid_columns: gridColumns,
 metadata: meta,
 };
 const markdown = generateRightsManifestMarkdown(updatedProject);
 const safeName = (name.trim() || "project")
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "_");
 downloadTextFile(
 `${safeName}_rights_manifest.md`,
 markdown,
 "text/markdown;charset=utf-8",
 );
 board.pushToast("success", "Rights manifest exported");
 };

 const rightsSummary = formatRightsSummary(meta);

 return (
 <Modal title="Project Settings & Rights Management" onClose={onClose} wide>
 <form onSubmit={handleSubmit} className="project-settings-form">
 {error && (
 <div className="error-box" role="alert">
 {error}
 </div>
 )}

 <div className="form-section">
 <h3>Deck Identity & Layout</h3>
 <div className="field-row">
 <label className="field" style={{ flex: 2 }}>
 <span>Deck Title</span>
 <input
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="e.g. Major Arcana / Afghan Hound Deck"
 required
 />
 </label>
 <label className="field" style={{ flex: 1 }}>
 <span>Grid Columns</span>
 <select
 value={gridColumns}
 onChange={(e) => setGridColumns(Number(e.target.value))}
 >
 <option value={1}>1 Column (Single Feed)</option>
 <option value={2}>2 Columns (Comfortable)</option>
 <option value={3}>3 Columns (Standard)</option>
 <option value={4}>4 Columns (Compact)</option>
 </select>
 </label>
 </div>

 <label className="field">
 <span>Edition / Version</span>
 <input
 value={meta.edition ?? ""}
 onChange={(e) => setMeta({ ...meta, edition: e.target.value })}
 placeholder="e.g. 1st Edition, Kickstarter Proof, Prototype v2"
 />
 </label>

 <label className="field">
 <span>Deck Description / Lore Premise</span>
 <textarea
 rows={3}
 value={meta.description ?? ""}
 onChange={(e) =>
 setMeta({ ...meta, description: e.target.value })
 }
 placeholder="Creative premise, artistic vision, or series background notes..."
 />
 </label>
 </div>

 <div className="form-section">
 <h3>Authorship & Publishing</h3>
 <div className="field-row">
 <label className="field">
 <span>Primary Author / Lead Artist</span>
 <input
 value={meta.author ?? ""}
 onChange={(e) => setMeta({ ...meta, author: e.target.value })}
 placeholder="e.g. Studio Lead / Illustrator Name"
 />
 </label>
 <label className="field">
 <span>Studio / Publisher</span>
 <input
 value={meta.studio ?? ""}
 onChange={(e) => setMeta({ ...meta, studio: e.target.value })}
 placeholder="e.g. Form & Noise"
 />
 </label>
 </div>
 </div>

 <div className="form-section">
 <h3>Legal, Rights & Licensing</h3>
 <div className="field-row">
 <label className="field">
 <span>Copyright Notice</span>
 <input
 value={meta.copyright ?? ""}
 onChange={(e) =>
 setMeta({ ...meta, copyright: e.target.value })
 }
 placeholder="e.g. © 2026 Studio Nocturne. All Rights Reserved."
 />
 </label>
 <label className="field">
 <span>Trademark / Brand Mark</span>
 <input
 value={meta.trademark ?? ""}
 onChange={(e) =>
 setMeta({ ...meta, trademark: e.target.value })
 }
 placeholder="e.g. Cartouche™ / Studio Series"
 />
 </label>
 </div>

 <div className="field-row">
 <label className="field">
 <span>License / Distribution Rights Preset</span>
 <select
 aria-label="License Preset"
 value={
 LICENSE_PRESETS.some(
 (p) =>
 p.label === meta.license ||
 p.spdxOrPlusCode === meta.license,
 )
 ? meta.license
 : "custom"
 }
 onChange={(e) => {
 if (e.target.value !== "custom") {
 setMeta({ ...meta, license: e.target.value });
 }
 }}
 >
 <optgroup label="Commercial & Publishing">
 <option value="All Rights Reserved">
 All Rights Reserved
 </option>
 <option value="Commercial Print Deck — Exclusive 1st Edition">
 Commercial Print Deck — Exclusive 1st Edition
 </option>
 <option value="Commercial Print & Digital — Non-Exclusive">
 Commercial Print & Digital — Non-Exclusive
 </option>
 <option value="Work for Hire / Full Rights Buyout">
 Work for Hire / Full Rights Buyout
 </option>
 <option value="Limited Edition Print Run (Up to 1,000 Units)">
 Limited Edition Print Run (Up to 1,000 Units)
 </option>
 </optgroup>
 <optgroup label="PLUS Universal Codes (IPTC / ISO 19566-5)">
 <option value="PLUS-LIC-DECK-EXCL-1ST">
 PLUS: Card Deck Physical Packaging (Exclusive 1st)
 </option>
 <option value="PLUS-LIC-DECK-NONEXCL">
 PLUS: Card Deck (Non-Exclusive)
 </option>
 <option value="PLUS-LIC-COMMERCIAL-UNLIMITED">
 PLUS: Commercial Unlimited Print & Digital
 </option>
 </optgroup>
 <optgroup label="Creative Commons (4.0 & CC0)">
 <option value="CC-BY-4.0">
 Creative Commons Attribution (CC BY 4.0)
 </option>
 <option value="CC-BY-NC-4.0">
 Creative Commons Non-Commercial (CC BY-NC 4.0)
 </option>
 <option value="CC-BY-NC-SA-4.0">
 CC Non-Commercial Share-Alike (CC BY-NC-SA 4.0)
 </option>
 <option value="CC-BY-ND-4.0">
 CC Attribution No-Derivatives (CC BY-ND 4.0)
 </option>
 <option value="CC0-1.0">
 Public Domain Dedication (CC0 1.0)
 </option>
 </optgroup>
 <optgroup label="Custom">
 <option value="custom">
 Custom License / Agreement String…
 </option>
 </optgroup>
 </select>
 </label>

 <label className="field">
 <span>License Term / Custom Token</span>
 <input
 value={meta.license ?? ""}
 onChange={(e) => setMeta({ ...meta, license: e.target.value })}
 placeholder="e.g. All Rights Reserved / PLUS-LIC-... / CC-BY-NC-4.0"
 />
 </label>
 </div>

 <label className="field">
 <span>AI Scraping & Training Policy (IPTC 2023+ Standard)</span>
 <select
 aria-label="AI Scraping Policy"
 value={meta.ai_policy ?? ""}
 onChange={(e) => setMeta({ ...meta, ai_policy: e.target.value })}
 >
 {AI_TRAINING_POLICIES.map((pol) => (
 <option key={pol.value} value={pol.value}>
 {pol.label}
 </option>
 ))}
 </select>
 </label>

 <div
 className="rights-preview-card"
 role="region"
 aria-label="Deck Rights Summary Preview"
 >
 <div className="rights-preview-header">
 <span className="rights-preview-title">
 Resolved Deck Rights Statement
 </span>
 <button
 type="button"
 className="btn-text-action"
 onClick={handleExportManifest}
 title="Download complete printable markdown rights report"
 >
 Export Rights Manifest (.md)
 </button>
 </div>
 <p className="rights-preview-body">
 {rightsSummary}
 {meta.ai_policy && (
 <span className="rights-preview-ai"> • {meta.ai_policy}</span>
 )}
 </p>
 </div>
 </div>

 <div className="modal-actions">
 <button type="button" className="btn secondary" onClick={onClose}>
 Cancel
 </button>
 <button type="submit" className="btn primary" disabled={busy}>
 {busy ? "Saving…" : "Save Settings"}
 </button>
 </div>
 </form>
 </Modal>
 );
}
