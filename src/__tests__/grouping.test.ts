import { describe, expect, it } from "vitest";
import {
  getSocketTags,
  getSocketPrimaryGroup,
  getSocketSubgroup,
  analyzeDeckTaxonomy,
  computeCounterpartMatrix,
} from "../lib/grouping";
import type { Socket } from "../api/types";

function makeSocket(id: string, pos: number, title: string, tags = ""): Socket {
  return {
    id,
    position: pos,
    title,
    notes: "",
    locked: false,
    selected_work_id: null,
    works: [],
    metadata: {
      status: "not_started",
      medium: "",
      tags,
      due_date: null,
    },
  };
}

describe("Card Grouping & Counterpart Matrix (lib/grouping.ts)", () => {
  it("extracts and normalizes tags accurately", () => {
    const s = makeSocket("1", 1, "The Fool", "major, air; archetype, 0");
    expect(getSocketTags(s)).toEqual(["major", "air", "archetype", "0"]);
  });

  it("classifies major vs minor arcana and detects suits", () => {
    const fool = makeSocket("1", 0, "00 - The Fool", "major, air");
    expect(getSocketPrimaryGroup(fool)).toBe("major");
    expect(getSocketSubgroup(fool)).toBeNull();

    const wandAce = makeSocket("2", 22, "Ace of Wands", "minor, wands, fire");
    expect(getSocketPrimaryGroup(wandAce)).toBe("minor");
    expect(getSocketSubgroup(wandAce)).toBe("wands");

    const cupTwo = makeSocket("3", 37, "Two of Cups", "cups, water");
    expect(getSocketPrimaryGroup(cupTwo)).toBe("minor");
    expect(getSocketSubgroup(cupTwo)).toBe("cups");
  });

  it("analyzes full 78-card tarot deck taxonomy with 4 suits of 14 cards", () => {
    const sockets: Socket[] = [];
    // 22 Major
    for (let i = 0; i < 22; i++) {
      sockets.push(makeSocket(`m${i}`, i, `Major Card ${i}`, "major"));
    }
    // 4 suits of 14
    const suits = ["wands", "cups", "swords", "pentacles"];
    let pos = 22;
    for (const suit of suits) {
      for (let r = 1; r <= 14; r++) {
        sockets.push(
          makeSocket(
            `${suit}_${r}`,
            pos++,
            `${r} of ${suit}`,
            `minor, ${suit}`,
          ),
        );
      }
    }

    expect(sockets.length).toBe(78);

    const tax = analyzeDeckTaxonomy(sockets);
    expect(tax.allCount).toBe(78);
    expect(tax.hasMajorMinor).toBe(true);
    expect(tax.majorCount).toBe(22);
    expect(tax.minorCount).toBe(56);
    expect(tax.suits.length).toBe(4);
    expect(tax.suits.every((s) => s.count === 14)).toBe(true);

    // Matrix verification
    expect(tax.matrix.isAvailable).toBe(true);
    expect(tax.matrix.subgroupCount).toBe(4);
    expect(tax.matrix.rowsPerColumn).toBe(14);
    expect(tax.matrix.rows.length).toBe(14);

    // Check Row 0 (Ace) counterparts
    const row0 = tax.matrix.rows[0];
    expect(row0.rankLabel).toContain("Ace");
    expect(row0.cards.length).toBe(4);
    expect(row0.cards[0]?.title).toBe("1 of wands");
    expect(row0.cards[1]?.title).toBe("1 of cups");
    expect(row0.cards[2]?.title).toBe("1 of swords");
    expect(row0.cards[3]?.title).toBe("1 of pentacles");

    // Check Row 13 (King) counterparts
    const row13 = tax.matrix.rows[13];
    expect(row13.rankLabel).toContain("King");
    expect(row13.cards[0]?.title).toBe("14 of wands");
    expect(row13.cards[3]?.title).toBe("14 of pentacles");
  });

  it("handles decks without even suits gracefully", () => {
    const sockets = [
      makeSocket("1", 0, "Card 1", "faction:alpha"),
      makeSocket("2", 1, "Card 2", "faction:alpha"),
      makeSocket("3", 2, "Card 3", "faction:beta"),
    ];

    const matrix = computeCounterpartMatrix([], sockets);
    expect(matrix.isAvailable).toBe(false);
  });
});
