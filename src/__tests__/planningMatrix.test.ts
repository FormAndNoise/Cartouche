import { describe, expect, it } from "vitest";
import type { Project, Socket } from "../api/types";
import {
  DEFAULT_RANKS,
  DEFAULT_SUBGROUPS,
  generatePlanningCsv,
  generatePlanningMarkdownDossier,
  getOrInitPlanningMatrix,
  PLANNING_DOMAIN_PRESETS,
  resolveSocketSymbolism,
  synthesizeTenantSymbolism,
  TAROT_RANKS,
  TAROT_SUBGROUPS,
} from "../lib/planningMatrix";

describe("Bottom-to-Top Planning Scratchpad & Symbolism Matrix", () => {
  const mockSockets: Socket[] = [
    {
      id: "s0",
      position: 0,
      title: "The Fool",
      notes: "The beginning of the journey",
      metadata: {
        status: "in_progress",
        medium: "Oil on linen",
        tags: "major-arcana, archetype",
        due_date: null,
      },
      locked: false,
      selected_work_id: null,
      works: [],
    },
    {
      id: "s1",
      position: 1,
      title: "Ace of Wands",
      notes: "Flaming branch",
      metadata: {
        status: "done",
        medium: "Digital",
        tags: "wands, fire, ace",
        due_date: null,
      },
      locked: false,
      selected_work_id: null,
      works: [],
    },
    {
      id: "s2",
      position: 2,
      title: "Queen of Cups",
      notes: "Enclosed throne by the sea",
      metadata: {
        status: "needs_review",
        medium: "Watercolor",
        tags: "cups, water, queen",
        due_date: null,
      },
      locked: false,
      selected_work_id: null,
      works: [],
    },
  ];

  const mockProject: Project = {
    name: "Arcane Deck",
    path: "/projects/arcane",
    grid_columns: 4,
    metadata: {
      edition: "1st Collector Edition",
      author: "Atelier Form & Noise",
    },
    sockets: mockSockets,
  };

  it("initializes default tarot subgroups and ranks cleanly", () => {
    const matrix = getOrInitPlanningMatrix(mockProject);
    expect(matrix.subgroups.length).toBe(5);
    expect(matrix.ranks.length).toBe(14);
    expect(matrix.subgroups.find((s) => s.id === "wands")?.element).toContain(
      "Fire",
    );
  });

  it("preserves full Hermetic & RWS Tarot symbolism across all 5 suits and 14 ranks", () => {
    expect(TAROT_SUBGROUPS.length).toBe(5);
    expect(TAROT_RANKS.length).toBe(14);

    const wands = TAROT_SUBGROUPS.find((s) => s.id === "wands")!;
    expect(wands.palette).toContain("Crimson");
    expect(wands.motifs).toContain("living staves");

    const swords = TAROT_SUBGROUPS.find((s) => s.id === "swords")!;
    expect(swords.element).toContain("Air");

    const king = TAROT_RANKS[13];
    expect(king.rankLabel).toContain("King");
    expect(king.archetype).toContain("Sovereign Patriarch");
  });

  it("synthesizes tenant symbolism by intersecting subgroup and rank dimensions", () => {
    const wandsSub = DEFAULT_SUBGROUPS.find((s) => s.id === "wands")!;
    const aceRank = DEFAULT_RANKS[0]; // Ace

    const sym = synthesizeTenantSymbolism(wandsSub, aceRank, "Ace of Wands");
    expect(sym.core_meaning).toContain("Ace of Wands:");
    expect(sym.core_meaning).toContain("Wands");
    expect(sym.visual_motifs).toBeDefined();
    expect(sym.visual_motifs?.toLowerCase()).toContain("sprouting");
    expect(sym.color_palette).toContain("Crimson");
    expect(sym.elemental_attribution).toContain("Fire");
  });

  it("resolves socket symbolism dynamically when not explicitly overridden", () => {
    const matrix = getOrInitPlanningMatrix(mockProject);
    const sym = resolveSocketSymbolism(mockSockets[1], matrix); // Ace of Wands
    expect(sym.core_meaning).toBeDefined();
    expect(sym.visual_motifs).toBeDefined();
  });

  it("exports a valid CSV spreadsheet representation of the deck planning matrix", () => {
    const csv = generatePlanningCsv(mockProject);
    expect(csv).toContain("position,title,status,subgroup,core_meaning");
    expect(csv).toContain("The Fool");
    expect(csv).toContain("Ace of Wands");
    expect(csv).toContain("Queen of Cups");
  });

  it("generates a rich markdown design dossier for the project", () => {
    const md = generatePlanningMarkdownDossier(mockProject);
    expect(md).toContain("# Conceptual Planning Scratchpad & Symbolism Matrix");
    expect(md).toContain("## 1. Subgroup & Category Dimensions");
    expect(md).toContain("## 2. Rank & Counterpart Dimensions");
    expect(md).toContain("## 3. Deliverable Socket Tenant Matrix Spreadsheet");
    expect(md).toContain("Ace of Wands");
  });

  it("provides comprehensive domain planning presets across varied creative use cases", () => {
    expect(PLANNING_DOMAIN_PRESETS.length).toBeGreaterThanOrEqual(7);

    // Tarot
    const tarot = PLANNING_DOMAIN_PRESETS.find((p) => p.id === "tarot");
    expect(tarot).toBeDefined();
    expect(tarot?.category).toBe("Tarot & Oracle");

    // Playing Cards
    const playingCards = PLANNING_DOMAIN_PRESETS.find(
      (p) => p.id === "playing_cards",
    );
    expect(playingCards).toBeDefined();
    expect(playingCards?.subgroups.length).toBe(4);
    expect(playingCards?.ranks.length).toBe(13);

    // TCG
    const tcg = PLANNING_DOMAIN_PRESETS.find((p) => p.id === "tcg_factions");
    expect(tcg).toBeDefined();
    expect(tcg?.subgroups.length).toBe(5);
    expect(tcg?.ranks.length).toBe(6);

    // Storyboard / Narrative Arc
    const story = PLANNING_DOMAIN_PRESETS.find((p) => p.id === "narrative_arc");
    expect(story).toBeDefined();
    expect(story?.category).toBe("Story & Art");
    expect(story?.subgroups.length).toBe(4);
    expect(story?.ranks.length).toBe(6);

    // Character Sprites
    const sprites = PLANNING_DOMAIN_PRESETS.find(
      (p) => p.id === "character_sprites",
    );
    expect(sprites).toBeDefined();
    expect(sprites?.subgroups.length).toBe(4);
    expect(sprites?.ranks.length).toBe(6);

    // Custom Blank Slate
    const blank = PLANNING_DOMAIN_PRESETS.find((p) => p.id === "custom_blank");
    expect(blank).toBeDefined();
    expect(blank?.category).toBe("Custom");
    expect(blank?.subgroups.length).toBe(4);
  });
});
