import { describe, expect, it } from "vitest";
import type { Project, Socket } from "../api/types";
import {
  DEFAULT_RANKS,
  DEFAULT_SUBGROUPS,
  generatePlanningCsv,
  generatePlanningMarkdownDossier,
  getOrInitPlanningMatrix,
  resolveSocketSymbolism,
  synthesizeTenantSymbolism,
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

  it("initializes default subgroups and ranks", () => {
    const matrix = getOrInitPlanningMatrix(mockProject);
    expect(matrix.subgroups.length).toBeGreaterThanOrEqual(5);
    expect(matrix.ranks.length).toBeGreaterThanOrEqual(14);
    expect(matrix.subgroups.find((s) => s.id === "wands")?.element).toContain(
      "Fire",
    );
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
    expect(md).toContain("## 1. Subgroup & Suit Dimensions");
    expect(md).toContain("## 2. Rank & Counterpart Dimensions");
    expect(md).toContain("## 3. Deliverable Socket Tenant Matrix Spreadsheet");
    expect(md).toContain("Ace of Wands");
  });
});
