import { useState } from "react";
import {
  PLANNING_DOMAIN_PRESETS,
  type PlanningDomainPreset,
} from "../lib/planningMatrix";
import { Modal } from "./Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: PlanningDomainPreset) => Promise<void>;
}

export function PlanningPresetModal({
  isOpen,
  onClose,
  onSelectPreset,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("tarot");

  if (!isOpen) return null;

  const categories = [
    "All",
    "Tarot & Oracle",
    "Card Games",
    "Board Games",
    "Story & Art",
    "Design & UI",
    "Custom",
  ];

  const filteredPresets = PLANNING_DOMAIN_PRESETS.filter((p) => {
    if (selectedCategory === "All") return true;
    return p.category === selectedCategory;
  });

  const activePreset =
    PLANNING_DOMAIN_PRESETS.find((p) => p.id === selectedPresetId) ||
    PLANNING_DOMAIN_PRESETS[0];

  const handleApply = async () => {
    await onSelectPreset(activePreset);
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      title="🔮 Conceptual Planning & Domain Matrix Templates"
      wide
    >
      <div
        className="planning-preset-modal"
        data-testid="planning-preset-modal"
      >
        <p className="planning-preset-intro">
          Choose a domain template to configure the vertical dimensions (Suits /
          Factions / Categories) and horizontal progressions (Ranks / Tiers /
          Stages) for your project, or choose a clean custom matrix to fill in
          your own details.
        </p>

        {/* Category Filter Pills */}
        <div className="preset-category-bar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`preset-cat-pill ${selectedCategory === cat ? "active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Preset Cards Grid */}
        <div className="preset-cards-list">
          {filteredPresets.map((preset) => (
            <div
              key={preset.id}
              className={`preset-select-card ${selectedPresetId === preset.id ? "selected" : ""}`}
              onClick={() => setSelectedPresetId(preset.id)}
            >
              <div className="preset-card-top">
                <div className="preset-name-block">
                  <h4>{preset.name}</h4>
                  <span className="preset-cat-badge">{preset.category}</span>
                </div>
                <span className="preset-dim-count">
                  {preset.subgroups.length} Subgroups × {preset.ranks.length}{" "}
                  Ranks
                </span>
              </div>

              <p className="preset-desc">{preset.description}</p>

              <div className="preset-preview-tags">
                <span className="preview-label">Dimensions:</span>
                {preset.subgroups.slice(0, 4).map((s) => (
                  <span key={s.id} className="preview-tag">
                    {s.label.split("/")[0].trim()}
                  </span>
                ))}
                {preset.subgroups.length > 4 && (
                  <span className="preview-more">
                    +{preset.subgroups.length - 4} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Selected Preset Detailed Preview */}
        {activePreset && (
          <div className="preset-detail-preview">
            <div className="preview-section">
              <h5>
                Vertical Slices / Categories ({activePreset.subgroups.length}):
              </h5>
              <div className="preview-pill-list">
                {activePreset.subgroups.map((s) => (
                  <span key={s.id} className="detail-pill" title={s.theme}>
                    <strong>{s.label.split("/")[0].trim()}</strong>
                    {s.element && (
                      <span className="elem-sub">
                        ({s.element.split("/")[0].trim()})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div className="preview-section">
              <h5>
                Horizontal Progression / Ranks ({activePreset.ranks.length}):
              </h5>
              <div className="preview-pill-list">
                {activePreset.ranks.map((r) => (
                  <span key={r.rankIndex} className="detail-pill rank-pill">
                    {r.rankLabel.split("(")[0].trim()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="planning-preset-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleApply}>
            Apply Template: {activePreset.name}
          </button>
        </div>
      </div>
    </Modal>
  );
}
