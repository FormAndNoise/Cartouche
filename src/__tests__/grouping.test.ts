import { describe, expect, it } from "vitest";
import {
 getSocketTags,
 getSocketPrimaryGroup,
 getSocketSubgroup,
 analyzeDeckTaxonomy,
 computeCounterpartMatrix,
 MATRIX_PRESETS,
} from "../lib/grouping";
import type { MatrixConfig, Socket } from "../api/types";

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

 it("supports user-configured custom matrix table with sequential chunks", () => {
 // 12 game cards configured as 3 Factions × 4 Tiers
 const sockets = Array.from({ length: 12 }, (_, i) =>
 makeSocket(`s_${i}`, i, `Unit #${i + 1}`),
 );

 const customConfig: MatrixConfig = {
 mode: "custom_grid",
 columnCount: 3,
 sliceMode: "sequential",
 columns: [
 { id: "c1", label: "Solar Empire" },
 { id: "c2", label: "Lunar Syndicate" },
 { id: "c3", label: "Star Nomads" },
 ],
 rows: [
 { id: "r1", label: "Tier 1: Scout" },
 { id: "r2", label: "Tier 2: Soldier" },
 { id: "r3", label: "Tier 3: Knight" },
 { id: "r4", label: "Tier 4: Titan" },
 ],
 };

 const tax = analyzeDeckTaxonomy(sockets, customConfig);
 expect(tax.matrix.isAvailable).toBe(true);
 expect(tax.matrix.subgroupCount).toBe(3);
 expect(tax.matrix.rows.length).toBe(4);
 expect(tax.matrix.columnHeaders[0]).toContain("Solar Empire (4)");
 expect(tax.matrix.columnHeaders[1]).toContain("Lunar Syndicate (4)");
 expect(tax.matrix.columnHeaders[2]).toContain("Star Nomads (4)");

 // First row checks
 expect(tax.matrix.rows[0].rankLabel).toBe("Tier 1: Scout");
 expect(tax.matrix.rows[0].cards[0]?.title).toBe("Unit #1");
 expect(tax.matrix.rows[0].cards[1]?.title).toBe("Unit #5");
 expect(tax.matrix.rows[0].cards[2]?.title).toBe("Unit #9");

 // Last row checks
 expect(tax.matrix.rows[3].rankLabel).toBe("Tier 4: Titan");
 expect(tax.matrix.rows[3].cards[0]?.title).toBe("Unit #4");
 expect(tax.matrix.rows[3].cards[1]?.title).toBe("Unit #8");
 expect(tax.matrix.rows[3].cards[2]?.title).toBe("Unit #12");
 });

 it("supports user-configured matrix with interleaved distribution", () => {
 const sockets = Array.from({ length: 6 }, (_, i) =>
 makeSocket(`s_${i}`, i, `Item ${i + 1}`),
 );

 const customConfig: MatrixConfig = {
 mode: "custom_grid",
 columnCount: 2,
 sliceMode: "interleaved",
 columns: [
 { id: "col_a", label: "Column A" },
 { id: "col_b", label: "Column B" },
 ],
 rows: [
 { id: "r1", label: "Row 1" },
 { id: "r2", label: "Row 2" },
 { id: "r3", label: "Row 3" },
 ],
 };

 const tax = analyzeDeckTaxonomy(sockets, customConfig);
 expect(tax.matrix.subgroupCount).toBe(2);
 expect(tax.matrix.rows.length).toBe(3);

 // Row 0 has Item 1 (Col A) and Item 2 (Col B)
 expect(tax.matrix.rows[0].cards[0]?.title).toBe("Item 1");
 expect(tax.matrix.rows[0].cards[1]?.title).toBe("Item 2");

 // Row 1 has Item 3 (Col A) and Item 4 (Col B)
 expect(tax.matrix.rows[1].cards[0]?.title).toBe("Item 3");
 expect(tax.matrix.rows[1].cards[1]?.title).toBe("Item 4");
 });

 it("supports tag-based custom column matching", () => {
 const sockets = [
 makeSocket("1", 0, "Fire Blast", "pyro, spell"),
 makeSocket("2", 1, "Water Wall", "hydro, spell"),
 makeSocket("3", 2, "Fire Golem", "pyro, unit"),
 makeSocket("4", 3, "Water Sprite", "hydro, unit"),
 ];

 const customConfig: MatrixConfig = {
 mode: "custom_grid",
 sliceMode: "by_tag",
 columns: [
 { id: "pyro_col", label: "Pyro Faction", tagOrPrefix: "pyro" },
 { id: "hydro_col", label: "Hydro Faction", tagOrPrefix: "hydro" },
 ],
 rows: [
 { id: "r1", label: "Spell" },
 { id: "r2", label: "Unit" },
 ],
 };

 const tax = analyzeDeckTaxonomy(sockets, customConfig);
 expect(tax.matrix.subgroupCount).toBe(2);
 expect(tax.matrix.rows[0].cards[0]?.title).toBe("Fire Blast");
 expect(tax.matrix.rows[0].cards[1]?.title).toBe("Water Wall");
 expect(tax.matrix.rows[1].cards[0]?.title).toBe("Fire Golem");
 expect(tax.matrix.rows[1].cards[1]?.title).toBe("Water Sprite");
 });

 it("provides rich domain presets", () => {
 expect(MATRIX_PRESETS.length).toBeGreaterThanOrEqual(5);
 const tcg = MATRIX_PRESETS.find((p) => p.id === "tcg_factions");
 expect(tcg).toBeDefined();
 expect(tcg?.columns.length).toBe(5);
 expect(tcg?.rows.length).toBe(6);

 const boardGame = MATRIX_PRESETS.find((p) => p.id === "board_game");
 expect(boardGame).toBeDefined();
 expect(boardGame?.columns.length).toBe(4);
 expect(boardGame?.rows.length).toBe(6);
 });

 it("provides automatic best-fit matrix fallback when no custom config exists", () => {
 const sockets = [
 makeSocket("1", 0, "Card 1"),
 makeSocket("2", 1, "Card 2"),
 makeSocket("3", 2, "Card 3"),
 makeSocket("4", 3, "Card 4"),
 makeSocket("5", 4, "Card 5"),
 ];

 const matrix = computeCounterpartMatrix([], sockets);
 expect(matrix.isAvailable).toBe(true);
 expect(matrix.rows.length).toBeGreaterThan(0);
 expect(matrix.columnHeaders.length).toBeGreaterThan(0);
 });
});
