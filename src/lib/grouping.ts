/**
 * Card Grouping, Taxonomy & Synchronized Matrix Engine for Cartouche.
 *
 * Automatically organizes cards by:
 * - Primary classifications (Major vs Minor Arcana, Factions, Archetypes)
 * - Sub-group partitions (Suits: Wands, Cups, Swords, Pentacles / Hearts, Spades, etc.)
 * - Equal-division Counterpart Matrix (comparing suits side-by-side with locked vertical alignment)
 */
import type { Socket } from "../api/types";

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
}

const KNOWN_SUITS = [
  { name: "wands", label: "Wands / Batons / Rods" },
  { name: "cups", label: "Cups / Chalices" },
  { name: "swords", label: "Swords / Blades" },
  { name: "pentacles", label: "Pentacles / Coins / Disks" },
  { name: "hearts", label: "Hearts" },
  { name: "diamonds", label: "Diamonds" },
  { name: "clubs", label: "Clubs" },
  { name: "spades", label: "Spades" },
];

const KNOWN_RANKS = [
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
      t.startsWith("faction:")
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
export function analyzeDeckTaxonomy(sockets: Socket[]): DeckTaxonomy {
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

  const matrix = computeCounterpartMatrix(suits, sorted);

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
 * Computes a synchronized counterpart comparison matrix across evenly divisible subgroups.
 */
export function computeCounterpartMatrix(
  suits: { id: string; label: string; count: number; sockets: Socket[] }[],
  allSockets: Socket[],
): CounterpartMatrix {
  // If we have 2 to 6 identified suits with the exact same count (>0)
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

  // Fallback: Check if total sockets divide evenly into 4 columns (standard 56 minor or 52 playing deck)
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

  return {
    isAvailable: false,
    columnHeaders: [],
    subgroupCount: 0,
    rowsPerColumn: 0,
    rows: [],
  };
}
