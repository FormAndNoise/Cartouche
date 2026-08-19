import { useState } from "react";
import type {
  CustomMatrixColumn,
  CustomMatrixRow,
  MatrixConfig,
  Project,
} from "../api/types";
import { MATRIX_PRESETS, type MatrixPreset } from "../lib/grouping";
import { Modal } from "./Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onSaveConfig: (config: MatrixConfig | undefined) => Promise<void>;
}

export function MatrixConfigModal({
  isOpen,
  onClose,
  project,
  onSaveConfig,
}: Props) {
  const existingConfig = project.metadata?.matrix_config;

  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    existingConfig?.preset ||
      (project.sockets.length >= 70 ? "tarot" : "custom"),
  );

  const [columns, setColumns] = useState<CustomMatrixColumn[]>(() => {
    if (existingConfig?.columns && existingConfig.columns.length > 0) {
      return [...existingConfig.columns];
    }
    const defaultPreset =
      MATRIX_PRESETS.find((p) => p.id === selectedPresetId) ||
      MATRIX_PRESETS[0];
    return defaultPreset.columns.map((c) => ({ ...c }));
  });

  const [rows, setRows] = useState<CustomMatrixRow[]>(() => {
    if (existingConfig?.rows && existingConfig.rows.length > 0) {
      return [...existingConfig.rows];
    }
    const defaultPreset =
      MATRIX_PRESETS.find((p) => p.id === selectedPresetId) ||
      MATRIX_PRESETS[0];
    return defaultPreset.rows.map((r) => ({ ...r }));
  });

  const [sliceMode, setSliceMode] = useState<
    "sequential" | "interleaved" | "by_tag"
  >(existingConfig?.sliceMode || "sequential");

  const handleApplyPreset = (preset: MatrixPreset) => {
    setSelectedPresetId(preset.id);
    setColumns(preset.columns.map((c) => ({ ...c })));
    setRows(preset.rows.map((r) => ({ ...r })));
    setSliceMode(preset.defaultSliceMode);
  };

  const handleColumnChange = (
    index: number,
    patch: Partial<CustomMatrixColumn>,
  ) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], ...patch };
    setColumns(updated);
  };

  const handleRowChange = (index: number, patch: Partial<CustomMatrixRow>) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], ...patch };
    setRows(updated);
  };

  const handleAddColumn = () => {
    const nextIdx = columns.length + 1;
    const newCol: CustomMatrixColumn = {
      id: `col_${nextIdx}`,
      label: `Column ${nextIdx}`,
      tagOrPrefix: `col${nextIdx}`,
    };
    setColumns([...columns, newCol]);
  };

  const handleRemoveColumn = (index: number) => {
    if (columns.length <= 2) return;
    const updated = columns.filter((_, i) => i !== index);
    setColumns(updated);
  };

  const handleAddRow = () => {
    const nextIdx = rows.length + 1;
    const newRow: CustomMatrixRow = {
      id: `row_${nextIdx}`,
      label: `Row ${nextIdx}`,
    };
    setRows([...rows, newRow]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const newConfig: MatrixConfig = {
      mode: "custom_grid",
      preset: selectedPresetId as MatrixConfig["preset"],
      columnCount: columns.length,
      rowCount: rows.length,
      columns,
      rows,
      sliceMode,
      updated_at: new Date().toISOString(),
    };
    await onSaveConfig(newConfig);
    onClose();
  };

  const handleResetToAuto = async () => {
    await onSaveConfig(undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      onClose={onClose}
      title="⚙ Configure Comparative Matrix Table"
    >
      <div className="matrix-config-modal" data-testid="matrix-config-modal">
        <p className="matrix-config-intro">
          Customize how your {project.sockets.length} deliverable sockets are
          arranged in the synchronized comparative matrix view. Select a domain
          preset or create your own custom column/row layout.
        </p>

        {/* Presets Section */}
        <section className="matrix-config-section">
          <h4>Domain Presets</h4>
          <div className="matrix-preset-pills">
            {MATRIX_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`matrix-preset-btn ${selectedPresetId === preset.id ? "active" : ""}`}
                onClick={() => handleApplyPreset(preset)}
                title={preset.description}
              >
                <strong>{preset.name}</strong>
                <span className="preset-subtext">
                  {preset.columnCount} Cols • {preset.defaultSliceMode}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Card Distribution Mode */}
        <section className="matrix-config-section">
          <h4>Card Distribution Strategy</h4>
          <div className="slice-mode-options">
            <label className="radio-label">
              <input
                type="radio"
                name="sliceMode"
                value="sequential"
                checked={sliceMode === "sequential"}
                onChange={() => setSliceMode("sequential")}
              />
              <span>
                <strong>Sequential Chunks</strong> (Col 1 = Sockets 1–N, Col 2 =
                Sockets N+1–2N...)
              </span>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="sliceMode"
                value="interleaved"
                checked={sliceMode === "interleaved"}
                onChange={() => setSliceMode("interleaved")}
              />
              <span>
                <strong>Interleaved Dealing</strong> (Socket 1 → Col 1, Socket 2
                → Col 2, Socket 3 → Col 3...)
              </span>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="sliceMode"
                value="by_tag"
                checked={sliceMode === "by_tag"}
                onChange={() => setSliceMode("by_tag")}
              />
              <span>
                <strong>Match Card Tags / Factions</strong> (Matches tag keyword
                e.g. <code>fire</code>, <code>suit:wands</code>)
              </span>
            </label>
          </div>
        </section>

        {/* Column Definitions */}
        <section className="matrix-config-section">
          <div className="section-header-row">
            <h4>Matrix Columns ({columns.length})</h4>
            <button
              type="button"
              className="add-item-btn"
              onClick={handleAddColumn}
            >
              + Add Column
            </button>
          </div>

          <div className="matrix-columns-editor">
            {columns.map((col, idx) => (
              <div key={idx} className="matrix-col-item">
                <span className="col-idx-badge">Col {idx + 1}</span>
                <input
                  type="text"
                  className="col-label-input"
                  placeholder="Column Label"
                  value={col.label}
                  onChange={(e) =>
                    handleColumnChange(idx, { label: e.target.value })
                  }
                />
                {sliceMode === "by_tag" && (
                  <input
                    type="text"
                    className="col-tag-input"
                    placeholder="Tag match keyword"
                    value={col.tagOrPrefix || ""}
                    onChange={(e) =>
                      handleColumnChange(idx, { tagOrPrefix: e.target.value })
                    }
                  />
                )}
                {columns.length > 2 && (
                  <button
                    type="button"
                    className="remove-item-btn"
                    onClick={() => handleRemoveColumn(idx)}
                    title="Remove column"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Row Definitions */}
        <section className="matrix-config-section">
          <div className="section-header-row">
            <h4>Matrix Row Labels ({rows.length})</h4>
            <button
              type="button"
              className="add-item-btn"
              onClick={handleAddRow}
            >
              + Add Row
            </button>
          </div>

          <div className="matrix-rows-editor">
            {rows.map((row, idx) => (
              <div key={idx} className="matrix-row-edit-item">
                <span className="row-idx-badge">Row {idx + 1}</span>
                <input
                  type="text"
                  className="row-label-input"
                  placeholder="Row label / stage / rank"
                  value={row.label}
                  onChange={(e) =>
                    handleRowChange(idx, { label: e.target.value })
                  }
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="remove-item-btn"
                    onClick={() => handleRemoveRow(idx)}
                    title="Remove row"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Footer Actions */}
        <div className="matrix-config-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleResetToAuto}
            title="Reset to automatic detection"
          >
            Reset to Auto-Detect
          </button>
          <div className="action-right-group">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleSave}>
              Apply Table Matrix
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
