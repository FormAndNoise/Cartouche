/**
 * Card Grouping, Taxonomy & Synchronized Matrix Engine for Cartouche.
 *
 * Automatically organizes cards by:
 * - Primary classifications (Major vs Minor Arcana, Factions, Archetypes)
 * - Sub-group partitions (Suits: Wands, Cups, Swords, Pentacles / Hearts, Spades, etc.)
 * - Equal-division Counterpart Matrix (comparing suits side-by-side with locked vertical alignment)
 * - User-Configurable Custom Matrix Tables (Presets for Tarot, Playing Cards, TCG Factions, Board Games, Design Kits, or Custom N×M Grids)
 */
import type { MatrixConfig, Socket } from "../api/types";

export interface DeckGroup {
  id: string;
  label: string;
  count: number;
  sockets: Socket[];
  subgroups?: DeckGroup[];
}

export interface CounterpartMatrixRow {
  rankIndex: number;
  rankLabel: string;
  cards: (Socket | null)[];
}

export interface CounterpartMatrix {
  isAvailable: boolean;
  columnHeaders: string[];
  subgroupCount: number;
  rowsPerColumn: number;
  rows: CounterpartMatrixRow[];
  activeConfig?: MatrixConfig;
}

export const KNOWN_SUITS = [
  { name: "wands", label: "Wands / Batons / Rods" },
  { name: "cups", label: "Cups / Chalices" },
  { name: "swords", label: "Swords / Blades" },
  { name: "pentacles", label: "Pentacles / Coins / Disks" },
  { name: "hearts", label: "Hearts" },
  { name: "diamonds", label: "Diamonds" },
  { name: "clubs", label: "Clubs" },
  { name: "spades", label: "Spades" },
];

export const KNOWN_RANKS = [
  "Ace",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Page",
  "Knight",
  "Queen",
  "King",
];

export interface MatrixPreset {
  id:
    | "tarot"
    | "playing_cards"
    | "tcg_factions"
    | "board_game"
    | "design_tokens"
    | "custom";
  name: string;
  description: string;
  columnCount: number;
  columns: { id: string; label: string; tagOrPrefix?: string }[];
  rows: { id: string; label: string }[];
  defaultSliceMode: "sequential" | "interleaved" | "by_tag";
}

export const MATRIX_PRESETS: MatrixPreset[] = [
  {
    id: "tarot",
    name: "Tarot Deck (4 Minor Suits + Ranks)",
    description: "Wands, Cups, Swords, Pentacles across 14 Ranks (Ace to King)",
    columnCount: 4,
    defaultSliceMode: "by_tag",
    columns: [
      { id: "wands", label: "Wands (Fire)", tagOrPrefix: "wands" },
      { id: "cups", label: "Cups (Water)", tagOrPrefix: "cups" },
      { id: "swords", label: "Swords (Air)", tagOrPrefix: "swords" },
      { id: "pentacles", label: "Pentacles (Earth)", tagOrPrefix: "pentacles" },
    ],
    rows: KNOWN_RANKS.map((r, i) => ({
      id: `rank_${i}`,
      label: `${i + 1}. ${r}`,
    })),
  },
  {
    id: "playing_cards",
    name: "Standard Playing Cards (52 Cards)",
    description:
      "Hearts, Diamonds, Clubs, Spades across 13 Ranks (Ace to King)",
    columnCount: 4,
    defaultSliceMode: "by_tag",
    columns: [
      { id: "hearts", label: "Hearts ♥", tagOrPrefix: "hearts" },
      { id: "diamonds", label: "Diamonds ♦", tagOrPrefix: "diamonds" },
      { id: "clubs", label: "Clubs ♣", tagOrPrefix: "clubs" },
      { id: "spades", label: "Spades ♠", tagOrPrefix: "spades" },
    ],
    rows: [
      "Ace",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "Jack",
      "Queen",
      "King",
    ].map((r, i) => ({ id: `rank_${i}`, label: `${i + 1}. ${r}` })),
  },
  {
    id: "tcg_factions",
    name: "TCG / CCG Card Game (5 Factions)",
    description: "5 Element Factions across Rarity Tiers",
    columnCount: 5,
    defaultSliceMode: "sequential",
    columns: [
      { id: "solar", label: "Solar / Light", tagOrPrefix: "light" },
      { id: "pyro", label: "Flame / Fire", tagOrPrefix: "fire" },
      { id: "hydro", label: "Tide / Water", tagOrPrefix: "water" },
      { id: "flora", label: "Grove / Nature", tagOrPrefix: "nature" },
      { id: "void", label: "Void / Shadow", tagOrPrefix: "shadow" },
    ],
    rows: [
      { id: "tier_common", label: "Common (Tier 1)" },
      { id: "tier_uncommon", label: "Uncommon (Tier 2)" },
      { id: "tier_rare", label: "Rare (Tier 3)" },
      { id: "tier_epic", label: "Epic (Tier 4)" },
      { id: "tier_legendary", label: "Legendary (Tier 5)" },
      { id: "tier_champion", label: "Mythic / Boss (Tier 6)" },
    ],
  },
  {
    id: "board_game",
    name: "Board Game Components (4 Types)",
    description: "Resources, Structures, Actions, Events across Levels 1-6",
    columnCount: 4,
    defaultSliceMode: "sequential",
    columns: [
      { id: "resources", label: "Resource Tiles", tagOrPrefix: "resource" },
      {
        id: "structures",
        label: "Structures / Buildings",
        tagOrPrefix: "structure",
      },
      { id: "actions", label: "Action Cards", tagOrPrefix: "action" },
      { id: "events", label: "Encounter / Events", tagOrPrefix: "event" },
    ],
    rows: Array.from({ length: 6 }, (_, i) => ({
      id: `stage_${i + 1}`,
      label: `Stage / Level ${i + 1}`,
    })),
  },
  {
    id: "design_tokens",
    name: "Design System / Asset Kit (6 Categories)",
    description: "UI Components & Assets across 4 Theme Variants / States",
    columnCount: 6,
    defaultSliceMode: "sequential",
    columns: [
      { id: "icons", label: "Icons / Glyphs", tagOrPrefix: "icon" },
      { id: "badges", label: "Badges / Tags", tagOrPrefix: "badge" },
      { id: "cards", label: "Cards / Slots", tagOrPrefix: "card" },
      { id: "inputs", label: "Inputs / Fields", tagOrPrefix: "input" },
      { id: "modals", label: "Modals / Dialogs", tagOrPrefix: "modal" },
      { id: "buttons", label: "Buttons / CTAs", tagOrPrefix: "button" },
    ],
    rows: [
      { id: "var_primary", label: "Primary / Default" },
      { id: "var_secondary", label: "Secondary / Subtle" },
      { id: "var_accent", label: "Accent / Active" },
      { id: "var_muted", label: "Muted / Disabled" },
    ],
  },
  {
    id: "custom",
    name: "Custom Table Grid",
    description: "Fully customizable columns, rows, and distribution mode",
    columnCount: 4,
    defaultSliceMode: "sequential",
    columns: [
      { id: "col_1", label: "Column A" },
      { id: "col_2", label: "Column B" },
      { id: "col_3", label: "Column C" },
      { id: "col_4", label: "Column D" },
    ],
    rows: Array.from({ length: 4 }, (_, i) => ({
      id: `row_${i + 1}`,
      label: `Row ${i + 1}`,
    })),
  },
];

/**
 * Normalizes a list of tags from comma- or space-separated metadata.
 */
export function getSocketTags(socket: Socket): string[] {
  const raw = socket.metadata.tags || "";
  return raw
    .toLowerCase()
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Determines primary category for a card (e.g. "major" vs "minor" or custom tag).
 */
export function getSocketPrimaryGroup(socket: Socket): string {
  const tags = getSocketTags(socket);
  const title = socket.title.toLowerCase();

  if (
    tags.includes("major") ||
    tags.includes("major_arcana") ||
    tags.includes("major arcana") ||
    title.includes("major")
  ) {
    return "major";
  }
  if (
    tags.includes("minor") ||
    tags.includes("minor_arcana") ||
    tags.includes("minor arcana") ||
    title.includes("minor")
  ) {
    return "minor";
  }

  // Check if it belongs to any known suit -> implies Minor Arcana
  for (const s of KNOWN_SUITS) {
    if (tags.includes(s.name) || title.includes(s.name)) {
      return "minor";
    }
  }

  // First non-numeric tag if present
  const nonNum = tags.find((t) => isNaN(Number(t)));
  return nonNum || "all";
}

/**
 * Identifies suit or secondary subgroup tag.
 */
export function getSocketSubgroup(socket: Socket): string | null {
  const tags = getSocketTags(socket);
  const title = socket.title.toLowerCase();

  for (const s of KNOWN_SUITS) {
    if (tags.includes(s.name) || title.includes(s.name)) {
      return s.name;
    }
  }

  // Check for explicit "suit:" or "group:" prefix
  for (const t of tags) {
    if (
      t.startsWith("suit:") ||
      t.startsWith("group:") ||
      t.startsWith("faction:") ||
      t.startsWith("category:")
    ) {
      return t.split(":")[1];
    }
  }

  return null;
}

export interface DeckTaxonomy {
  allCount: number;
  hasMajorMinor: boolean;
  majorCount: number;
  minorCount: number;
  suits: { id: string; label: string; count: number; sockets: Socket[] }[];
  allTags: { tag: string; count: number }[];
  matrix: CounterpartMatrix;
}

/**
 * Analyzes full deck of sockets to determine categories, suits, and counterpart matrix.
 */
export function analyzeDeckTaxonomy(
  sockets: Socket[],
  customConfig?: MatrixConfig,
): DeckTaxonomy {
  const sorted = [...sockets].sort((a, b) => a.position - b.position);
  let majorCount = 0;
  let minorCount = 0;
  const suitMap = new Map<string, Socket[]>();
  const tagCountMap = new Map<string, number>();

  for (const s of sorted) {
    const pGroup = getSocketPrimaryGroup(s);
    if (pGroup === "major") majorCount++;
    if (pGroup === "minor") minorCount++;

    const sub = getSocketSubgroup(s);
    if (sub) {
      if (!suitMap.has(sub)) suitMap.set(sub, []);
      suitMap.get(sub)!.push(s);
    }

    for (const t of getSocketTags(s)) {
      tagCountMap.set(t, (tagCountMap.get(t) || 0) + 1);
    }
  }

  const suits = Array.from(suitMap.entries()).map(([id, list]) => {
    const known = KNOWN_SUITS.find((k) => k.name === id);
    const label = known
      ? known.label.split("/")[0].trim()
      : id.charAt(0).toUpperCase() + id.slice(1);
    return {
      id,
      label,
      count: list.length,
      sockets: list,
    };
  });

  const allTags = Array.from(tagCountMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const matrix = computeCounterpartMatrix(suits, sorted, customConfig);

  return {
    allCount: sorted.length,
    hasMajorMinor: majorCount > 0 && minorCount > 0,
    majorCount,
    minorCount,
    suits,
    allTags,
    matrix,
  };
}

/**
 * Computes a synchronized counterpart comparison matrix across evenly divisible subgroups
 * or based on a user's custom matrix configuration.
 */
export function computeCounterpartMatrix(
  suits: { id: string; label: string; count: number; sockets: Socket[] }[],
  allSockets: Socket[],
  customConfig?: MatrixConfig,
): CounterpartMatrix {
  if (allSockets.length === 0) {
    return {
      isAvailable: false,
      columnHeaders: [],
      subgroupCount: 0,
      rowsPerColumn: 0,
      rows: [],
    };
  }

  // 1. Explicit User-Configured Matrix
  if (customConfig && customConfig.columns && customConfig.columns.length > 0) {
    const cols = customConfig.columns;
    const colCount = cols.length;
    const sliceMode = customConfig.sliceMode || "sequential";

    // Compute column buckets
    const colBuckets: (Socket | null)[][] = Array.from(
      { length: colCount },
      () => [],
    );

    if (sliceMode === "by_tag") {
      for (const s of allSockets) {
        const tags = getSocketTags(s);
        const title = s.title.toLowerCase();
        let placed = false;
        for (let cIdx = 0; cIdx < colCount; cIdx++) {
          const col = cols[cIdx];
          const matchKey = (col.tagOrPrefix || col.id).toLowerCase();
          if (
            tags.includes(matchKey) ||
            title.includes(matchKey) ||
            getSocketSubgroup(s) === matchKey
          ) {
            colBuckets[cIdx].push(s);
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Find shortest bucket
          let minIdx = 0;
          for (let i = 1; i < colCount; i++) {
            if (colBuckets[i].length < colBuckets[minIdx].length) {
              minIdx = i;
            }
          }
          colBuckets[minIdx].push(s);
        }
      }
    } else if (sliceMode === "interleaved") {
      for (let i = 0; i < allSockets.length; i++) {
        colBuckets[i % colCount].push(allSockets[i]);
      }
    } else {
      // sequential slice
      const chunkSize = Math.max(1, Math.ceil(allSockets.length / colCount));
      for (let cIdx = 0; cIdx < colCount; cIdx++) {
        colBuckets[cIdx] = allSockets.slice(
          cIdx * chunkSize,
          (cIdx + 1) * chunkSize,
        );
      }
    }

    const maxRows = Math.max(
      customConfig.rows?.length || 0,
      ...colBuckets.map((b) => b.length),
      1,
    );

    const rows: CounterpartMatrixRow[] = [];
    for (let r = 0; r < maxRows; r++) {
      const rowCards: (Socket | null)[] = [];
      for (let cIdx = 0; cIdx < colCount; cIdx++) {
        rowCards.push(colBuckets[cIdx][r] || null);
      }

      const explicitRow = customConfig.rows?.[r];
      const rankLabel =
        explicitRow?.label ||
        (r < KNOWN_RANKS.length
          ? `${r + 1}. ${KNOWN_RANKS[r]}`
          : `Row ${r + 1}`);

      rows.push({
        rankIndex: r,
        rankLabel,
        cards: rowCards,
      });
    }

    return {
      isAvailable: true,
      columnHeaders: cols.map(
        (c, idx) => `${c.label} (${colBuckets[idx].length})`,
      ),
      subgroupCount: colCount,
      rowsPerColumn: maxRows,
      rows,
      activeConfig: customConfig,
    };
  }

  // 2. Auto-Detect Tarot / Known Suits with equal card count
  if (suits.length >= 2) {
    const targetCount = suits[0].count;
    const allEqual = suits.every(
      (s) => s.count === targetCount && targetCount > 0,
    );

    if (allEqual) {
      const rows: CounterpartMatrixRow[] = [];
      for (let r = 0; r < targetCount; r++) {
        const rowCards: (Socket | null)[] = [];
        for (const s of suits) {
          rowCards.push(s.sockets[r] || null);
        }

        const rankLabel =
          r < KNOWN_RANKS.length
            ? `${r + 1}. ${KNOWN_RANKS[r]}`
            : `Card #${r + 1}`;

        rows.push({
          rankIndex: r,
          rankLabel,
          cards: rowCards,
        });
      }

      return {
        isAvailable: true,
        columnHeaders: suits.map((s) => `${s.label} (${s.count})`),
        subgroupCount: suits.length,
        rowsPerColumn: targetCount,
        rows,
      };
    }
  }

  // 3. Auto-Detect 4-column Minor Arcana / Playing Deck
  const minorOnly = allSockets.filter(
    (s) => getSocketPrimaryGroup(s) === "minor",
  );
  if (minorOnly.length >= 8 && minorOnly.length % 4 === 0) {
    const colSize = minorOnly.length / 4;
    const cols = [
      minorOnly.slice(0, colSize),
      minorOnly.slice(colSize, colSize * 2),
      minorOnly.slice(colSize * 2, colSize * 3),
      minorOnly.slice(colSize * 3, colSize * 4),
    ];

    const rows: CounterpartMatrixRow[] = [];
    for (let r = 0; r < colSize; r++) {
      rows.push({
        rankIndex: r,
        rankLabel:
          r < KNOWN_RANKS.length
            ? `${r + 1}. ${KNOWN_RANKS[r]}`
            : `Rank ${r + 1}`,
        cards: [cols[0][r], cols[1][r], cols[2][r], cols[3][r]],
      });
    }

    return {
      isAvailable: true,
      columnHeaders: [
        `Group 1 (${colSize})`,
        `Group 2 (${colSize})`,
        `Group 3 (${colSize})`,
        `Group 4 (${colSize})`,
      ],
      subgroupCount: 4,
      rowsPerColumn: colSize,
      rows,
    };
  }

  // 4. Default Best-Fit Matrix (so matrix is ALWAYS available for any deck size!)
  const total = allSockets.length;
  let autoCols = 4;
  if (total <= 6) autoCols = Math.min(total, 3);
  else if (total <= 15) autoCols = 3;
  else if (total <= 36) autoCols = 4;
  else if (total % 5 === 0) autoCols = 5;
  else if (total % 6 === 0) autoCols = 6;
  else autoCols = 4;

  const chunkSize = Math.ceil(total / autoCols);
  const rows: CounterpartMatrixRow[] = [];
  const colBuckets: (Socket | null)[][] = Array.from(
    { length: autoCols },
    (_, cIdx) => allSockets.slice(cIdx * chunkSize, (cIdx + 1) * chunkSize),
  );

  for (let r = 0; r < chunkSize; r++) {
    const rowCards: (Socket | null)[] = [];
    for (let c = 0; c < autoCols; c++) {
      rowCards.push(colBuckets[c][r] || null);
    }
    rows.push({
      rankIndex: r,
      rankLabel:
        r < KNOWN_RANKS.length ? `${r + 1}. ${KNOWN_RANKS[r]}` : `Row ${r + 1}`,
      cards: rowCards,
    });
  }

  return {
    isAvailable: total > 0,
    columnHeaders: Array.from(
      { length: autoCols },
      (_, i) => `Column ${i + 1} (${colBuckets[i].length})`,
    ),
    subgroupCount: autoCols,
    rowsPerColumn: chunkSize,
    rows,
  };
}
