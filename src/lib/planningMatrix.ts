/**
 * Bottom-to-Top Dimensional Synthesis & Symbolism Scratchpad Engine.
 *
 * Enables visual artists and deck creators to build dimensional notes:
 * 1. Subgroup Dimensions (e.g. Suits: Wands/Cups/Swords/Pentacles/Major)
 * 2. Rank Dimensions (e.g. Ranks: Ace through King / Steps 1..N)
 * 3. Synthesis Matrix: Generates intersecting symbolism, visual motifs, color palettes,
 *    and composition briefs for each socket tenant in a spreadsheet table.
 */
import type {
  PlanningMatrixData,
  Project,
  RankDimension,
  Socket,
  SocketTenantSymbolism,
  SubgroupDimension,
} from "../api/types";
import { getSocketPrimaryGroup, getSocketSubgroup } from "./grouping";

export const DEFAULT_SUBGROUPS: SubgroupDimension[] = [
  {
    id: "wands",
    label: "Wands / Rods (Fire)",
    element: "Fire / Spirit / Willpower",
    theme: "Creative Inspiration, Vital Action, Passion, Spiritual Drive",
    palette: "Crimson, Amber, Burnt Sienna, Solar Gold, Saffron",
    motifs:
      "Sprouting living staves, roaring flames, salamander, lions, desert mesas",
    notes: "Express kinetic energy and spontaneous ignition.",
  },
  {
    id: "cups",
    label: "Cups / Chalices (Water)",
    element: "Water / Emotion / Intuition",
    theme: "Emotional Depth, Relationships, Subconscious Wisdom, Dreams",
    palette: "Azure, Ultramarine, Seafoam, Pearl, Iridescent Indigo",
    motifs:
      "Engraved chalices, rising springs, lotus blossoms, marine life, moonlight",
    notes: "Fluid, atmospheric lighting with reflective water surfaces.",
  },
  {
    id: "swords",
    label: "Swords / Blades (Air)",
    element: "Air / Intellect / Reason",
    theme: "Intellectual Discernment, Conflict, Truth, Perception, Clarity",
    palette: "Slate Blue, Steel Grey, Pale Dawn Yellow, Stark White",
    motifs:
      "Double-edged blades, bird feathers, tempestuous clouds, wind vectors, mountain spires",
    notes: "Geometric precision, sharp contrast, and atmospheric tension.",
  },
  {
    id: "pentacles",
    label: "Pentacles / Coins (Earth)",
    element: "Earth / Physicality / Wealth",
    theme:
      "Material Manifestation, Craftsmanship, Natural Abundance, Foundation",
    palette: "Forest Green, Ochre, Terracotta, Copper, Rich Loam",
    motifs:
      "Carved golden disks, pentagrams, grapevines, ancient stonework, bulls, harvest grain",
    notes: "Tactile textures, heavy grounded compositions, and organic detail.",
  },
  {
    id: "major",
    label: "Major Arcana (Quintessence)",
    element: "Quintessence / Universal Archetype",
    theme: "Macrocosmic Initiation, Spiritual Transformation, Hero's Journey",
    palette: "Royal Violet, Obsidian, Radiant Gold, Lapis Lazuli",
    motifs:
      "Astrological sigils, ceremonial gateways, celestial halos, tarot triumphal emblems",
    notes: "Monolithic, transcendent scale and archetypal universality.",
  },
];

export const DEFAULT_RANKS: RankDimension[] = [
  {
    rankIndex: 0,
    rankLabel: "Ace (Seed / 01)",
    meaning:
      "Primordial seed of pure potential; the unadulterated divine impulse.",
    composition_rule:
      "Single colossal focal artifact emerging from a radiant atmospheric glow.",
    archetype: "The Initiator / Pristine Origin",
  },
  {
    rankIndex: 1,
    rankLabel: "Two (Polarity / 02)",
    meaning:
      "First encounter with duality, partnership, balance, or decisive choice.",
    composition_rule:
      "Bilateral symmetry or tension between two distinct forces across a horizon.",
    archetype: "The Threshold / Dynamic Equilibrium",
  },
  {
    rankIndex: 2,
    rankLabel: "Three (Synthesis / 03)",
    meaning:
      "Initial creative expression, collaboration, early fruition, expansion.",
    composition_rule: "Triadic geometry; motion moving forward into depth.",
    archetype: "The Catalyst / First Manifestation",
  },
  {
    rankIndex: 3,
    rankLabel: "Four (Structure / 04)",
    meaning:
      "Stability, order, boundary formation, consolidating a foundation.",
    composition_rule:
      "Enclosed or four-pillared architectural frame; grounded gravity.",
    archetype: "The Fortress / Consolidation",
  },
  {
    rankIndex: 4,
    rankLabel: "Five (Disruption / 05)",
    meaning:
      "Crisis of growth, loss, conflict, testing of structural endurance.",
    composition_rule:
      "Strong diagonal vectors, scattered items, off-center focal disruption.",
    archetype: "The Trial / Unstable Catalyst",
  },
  {
    rankIndex: 5,
    rankLabel: "Six (Harmony / 06)",
    meaning:
      "Restored equilibrium, reciprocal generosity, nostalgia, sweet resolution.",
    composition_rule:
      "Harmonious radiant lighting; two balanced figure groupings or elements.",
    archetype: "The Sanctuary / Balanced Grace",
  },
  {
    rankIndex: 6,
    rankLabel: "Seven (Assessment / 07)",
    meaning:
      "Strategic choice, re-evaluation, patience, subtle inner mastery or illusion.",
    composition_rule:
      "Solitary contemplation facing asymmetrical cluster of elements.",
    archetype: "The Strategist / Inner Garden",
  },
  {
    rankIndex: 7,
    rankLabel: "Eight (Cadence / 08)",
    meaning:
      "Focused repetition, rhythmic craft, rapid direct execution, sudden transition.",
    composition_rule:
      "Repetitive rhythmic diagonal alignment or progressive stepped sequence.",
    archetype: "The Artisan / Flight of Velocity",
  },
  {
    rankIndex: 8,
    rankLabel: "Nine (Culmination / 09)",
    meaning:
      "Attainment near perfection, solitary resilience, self-reliance, vigilance.",
    composition_rule:
      "Subject enclosed by protective semicircle of the suit artifacts.",
    archetype: "The Guardian / Deep Fulfilment",
  },
  {
    rankIndex: 9,
    rankLabel: "Ten (Totality / 10)",
    meaning:
      "Cycle completion, maximum saturation, burden or legacy, transition to next tier.",
    composition_rule:
      "Full dense panoramic environment; 10 artifacts dominating composition.",
    archetype: "The Legacy / Overflowing Threshold",
  },
  {
    rankIndex: 10,
    rankLabel: "Page / Princess (11)",
    meaning:
      "Youthful curiosity, apprentice learner, eager messenger of new potential.",
    composition_rule:
      "Standing young figure studying the suit emblem intently in open landscape.",
    archetype: "The Neophyte / Eager Messenger",
  },
  {
    rankIndex: 11,
    rankLabel: "Knight / Prince (12)",
    meaning:
      "Dynamic drive, focused quest, intense pursuit, active mission in motion.",
    composition_rule:
      "High-speed kinetic diagonal gallop or charge across terrain.",
    archetype: "The Champion / Kinetic Drive",
  },
  {
    rankIndex: 12,
    rankLabel: "Queen (13)",
    meaning:
      "Inward sovereignty, receptive mastery, mature emotional/creative cultivation.",
    composition_rule:
      "Enclosed throne room or natural throne; calm, penetrating inward gaze.",
    archetype: "The Sovereign Mother / Inward Mastery",
  },
  {
    rankIndex: 13,
    rankLabel: "King (14)",
    meaning:
      "Outward authority, institutional governance, structural legacy, command.",
    composition_rule:
      "Elevated throne looking outward over conquered or governed lands.",
    archetype: "The Sovereign Patriarch / Concrete Authority",
  },
];

/**
 * Initializes or resolves planning matrix data for a deck.
 */
export function getOrInitPlanningMatrix(project: Project): PlanningMatrixData {
  const existing = project.metadata?.planning_matrix;
  if (existing && existing.subgroups.length > 0 && existing.ranks.length > 0) {
    return existing;
  }

  return {
    subgroups: [...DEFAULT_SUBGROUPS],
    ranks: [...DEFAULT_RANKS],
    updated_at: new Date().toISOString(),
  };
}

/**
 * Synthesizes a bottom-to-top symbolic profile by combining a Subgroup and Rank dimension.
 */
export function synthesizeTenantSymbolism(
  subgroup?: SubgroupDimension | null,
  rank?: RankDimension | null,
  cardTitle = "",
): SocketTenantSymbolism {
  if (!subgroup && !rank) {
    return {
      core_meaning: "Individual deliverable tenant.",
      visual_motifs: "",
      color_palette: "",
      composition_brief: "",
      elemental_attribution: "",
    };
  }

  const subLabel = subgroup?.label?.split("/")[0]?.trim() || "Suit";
  const element = subgroup?.element || "Elemental Force";
  const theme = subgroup?.theme || "";
  const subMotifs = subgroup?.motifs || "";
  const palette = subgroup?.palette || "";

  const rankLabel = rank?.rankLabel?.split("(")[0]?.trim() || "Rank";
  const rankMeaning = rank?.meaning || "";
  const compRule = rank?.composition_rule || "";
  const archetype = rank?.archetype || "";

  const titlePrefix = cardTitle ? `${cardTitle}: ` : "";

  return {
    core_meaning: `${titlePrefix}${rankMeaning} Expressed through the domain of ${subLabel} (${theme}).`,
    visual_motifs: `${rankLabel} motif integrated with ${subMotifs}. Key focal archetype: ${archetype}.`,
    color_palette: palette,
    composition_brief: `${compRule} Infused with ${element} lighting and atmosphere.`,
    elemental_attribution: element,
  };
}

/**
 * Resolves effective symbolism for a socket, using explicit metadata overrides
 * or synthesizing from project dimensions if not yet populated.
 */
export function resolveSocketSymbolism(
  socket: Socket,
  matrix: PlanningMatrixData,
): SocketTenantSymbolism {
  if (socket.metadata.symbolism && socket.metadata.symbolism.core_meaning) {
    return socket.metadata.symbolism;
  }

  // Find matching subgroup
  const subId = getSocketSubgroup(socket) || getSocketPrimaryGroup(socket);
  const matchedSub =
    matrix.subgroups.find((s) => s.id === subId) || matrix.subgroups[0];

  // Find matching rank
  const posInSuit = socket.position % Math.max(1, matrix.ranks.length);
  const matchedRank = matrix.ranks[posInSuit] || matrix.ranks[0];

  return synthesizeTenantSymbolism(matchedSub, matchedRank, socket.title);
}

/**
 * Generates CSV string containing the entire planning matrix and symbolism spreadsheet.
 */
export function generatePlanningCsv(project: Project): string {
  const matrix = getOrInitPlanningMatrix(project);
  const sorted = [...project.sockets].sort((a, b) => a.position - b.position);

  const headers = [
    "position",
    "title",
    "status",
    "subgroup",
    "core_meaning",
    "visual_motifs",
    "color_palette",
    "composition_brief",
    "elemental_attribution",
    "notes",
  ];

  const lines = [headers.join(",")];

  for (const s of sorted) {
    const sym = resolveSocketSymbolism(s, matrix);
    const sub = getSocketSubgroup(s) || getSocketPrimaryGroup(s);
    const row = [
      s.position + 1,
      `"${(s.title || "").replace(/"/g, '""')}"`,
      `"${s.metadata.status || "not_started"}"`,
      `"${sub}"`,
      `"${(sym.core_meaning || "").replace(/"/g, '""')}"`,
      `"${(sym.visual_motifs || "").replace(/"/g, '""')}"`,
      `"${(sym.color_palette || "").replace(/"/g, '""')}"`,
      `"${(sym.composition_brief || "").replace(/"/g, '""')}"`,
      `"${(sym.elemental_attribution || "").replace(/"/g, '""')}"`,
      `"${(s.notes || "").replace(/"/g, '""')}"`,
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Formats a rich Markdown design dossier of the entire planning scratchpad & matrix.
 */
export function generatePlanningMarkdownDossier(project: Project): string {
  const matrix = getOrInitPlanningMatrix(project);
  const sorted = [...project.sockets].sort((a, b) => a.position - b.position);

  let doc = `# Conceptual Planning Scratchpad & Symbolism Matrix — ${project.name}\n\n`;
  doc += `*Generated: ${new Date().toISOString()} • Edition: ${project.metadata?.edition || "1st Edition"}*\n\n`;

  doc += `## 1. Subgroup & Suit Dimensions (Vertical Archetypes)\n\n`;
  for (const sub of matrix.subgroups) {
    doc += `### ${sub.label}\n`;
    if (sub.element) doc += `- **Element & Domain**: ${sub.element}\n`;
    if (sub.theme) doc += `- **Core Theme**: ${sub.theme}\n`;
    if (sub.palette) doc += `- **Palette & Atmosphere**: ${sub.palette}\n`;
    if (sub.motifs) doc += `- **Visual Motifs**: ${sub.motifs}\n`;
    if (sub.notes) doc += `- **Artistic Invariant**: ${sub.notes}\n`;
    doc += `\n`;
  }

  doc += `## 2. Rank & Counterpart Dimensions (Horizontal Progression)\n\n`;
  doc += `| Rank | Meaning & Archetype | Compositional Framing Rule |\n`;
  doc += `| :--- | :--- | :--- |\n`;
  for (const r of matrix.ranks) {
    doc += `| **${r.rankLabel}** | ${r.meaning || "—"}<br>*Archetype: ${r.archetype || "—"}* | ${r.composition_rule || "—"} |\n`;
  }
  doc += `\n`;

  doc += `## 3. Deliverable Socket Tenant Matrix Spreadsheet\n\n`;
  doc += `| # | Title | Group | Core Meaning & Symbolism | Visual Motifs & Imagery | Color Palette | Composition Brief |\n`;
  doc += `| :-: | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const s of sorted) {
    const sym = resolveSocketSymbolism(s, matrix);
    const sub = getSocketSubgroup(s) || getSocketPrimaryGroup(s);
    doc += `| ${s.position + 1} | **${s.title || `Socket #${s.position + 1}`}** | ${sub} | ${(sym.core_meaning || "—").replace(/\|/g, "/")} | ${(sym.visual_motifs || "—").replace(/\|/g, "/")} | ${(sym.color_palette || "—").replace(/\|/g, "/")} | ${(sym.composition_brief || "—").replace(/\|/g, "/")} |\n`;
  }

  return doc;
}
