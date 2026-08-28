/**
 * Bottom-to-Top Dimensional Synthesis & Symbolism Scratchpad Engine.
 *
 * Enables visual artists and creators across multiple domains to build dimensional notes:
 * 1. Subgroup Dimensions (e.g. Suits: Wands/Cups/Swords/Pentacles/Major or Factions, Story Acts, Component Types)
 * 2. Rank Dimensions (e.g. Ranks: Ace..King, Progression Stages, Rarity Tiers, Pose States)
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

/**
 * 1. STANDARD TAROT ARCHETYPE SYSTEM (Preserved Full RWS / Hermetic Symbolism)
 */
export const TAROT_SUBGROUPS: SubgroupDimension[] = [
  {
    id: "wands",
    label: "Wands / Rods (Fire)",
    element: "Fire / Spirit / Willpower",
    theme: "Creative Inspiration, Vital Action, Passion, Spiritual Drive",
    palette: "Crimson, Amber, Burnt Sienna, Solar Gold, Saffron",
    motifs:
      "Sprouting living staves, roaring flames, salamanders, lions, desert mesas",
    notes:
      "Express kinetic energy, vertical impulse, and spontaneous ignition.",
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

export const TAROT_RANKS: RankDimension[] = [
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

// Alias for backwards compatibility
export const DEFAULT_SUBGROUPS = TAROT_SUBGROUPS;
export const DEFAULT_RANKS = TAROT_RANKS;

export interface PlanningDomainPreset {
  id:
    | "tarot"
    | "playing_cards"
    | "tcg_factions"
    | "board_game"
    | "narrative_arc"
    | "character_sprites"
    | "design_tokens"
    | "custom_blank";
  name: string;
  category:
    | "Tarot & Oracle"
    | "Card Games"
    | "Board Games"
    | "Story & Art"
    | "Design & UI"
    | "Custom";
  description: string;
  subgroups: SubgroupDimension[];
  ranks: RankDimension[];
}

export const PLANNING_DOMAIN_PRESETS: PlanningDomainPreset[] = [
  {
    id: "tarot",
    name: "Tarot Archetypes (4 Suits + Major)",
    category: "Tarot & Oracle",
    description:
      "Standard 78-card Hermetic & RWS symbolism across Fire, Water, Air, Earth, and Quintessence with 14 canonical ranks.",
    subgroups: [...TAROT_SUBGROUPS],
    ranks: [...TAROT_RANKS],
  },
  {
    id: "playing_cards",
    name: "Standard Playing Cards (52 Cards)",
    category: "Card Games",
    description:
      "4 French suits (Hearts, Diamonds, Clubs, Spades) across 13 numerical and court ranks (Ace through King).",
    subgroups: [
      {
        id: "hearts",
        label: "Hearts ♥ (Emotion / Soul)",
        element: "Water / Vital Force",
        theme: "Courage, love, joy, warmth, kinship, inner sanctuary",
        palette: "Crimson Red, Rose Pink, Cream, Gold Accents",
        motifs: "Embossed heart filigree, roses, stained glass, hearth light",
      },
      {
        id: "diamonds",
        label: "Diamonds ♦ (Wealth / Light)",
        element: "Earth / Crystal Radiance",
        theme: "Wealth, clarity, commerce, crystalline order, brilliance",
        palette: "Brilliant Amber, Topaz, Champagne Gold, Pure White",
        motifs: "Cut gemstones, vault keys, gilded scales, chandeliers",
      },
      {
        id: "clubs",
        label: "Clubs ♣ (Will / Vitality)",
        element: "Fire / Nature's Growth",
        theme: "Endurance, labor, primal growth, adventure, luck",
        palette: "Emerald, Forest Green, Bronze, Warm Umber",
        motifs: "Three-leaf clover crests, oak leaves, hunting horns, staves",
      },
      {
        id: "spades",
        label: "Spades ♠ (Wisdom / Destiny)",
        element: "Air / Fate & Intellect",
        theme: "Sovereignty, strategic discernment, solemn truth, destiny",
        palette: "Midnight Black, Slate Grey, Polished Steel, Ice Blue",
        motifs: "Pikes, heraldic shields, hourglasses, ravens, iron crowns",
      },
    ],
    ranks: [
      "Ace (The Premier)",
      "Two (Duality)",
      "Three (Expansion)",
      "Four (Foundation)",
      "Five (Turning Point)",
      "Six (Equilibrium)",
      "Seven (Strategy)",
      "Eight (Rhythm)",
      "Nine (Apex)",
      "Ten (Completeness)",
      "Jack (The Knight/Courier)",
      "Queen (The Receptive Sovereign)",
      "King (The Ruling Monarch)",
    ].map((label, idx) => ({
      rankIndex: idx,
      rankLabel: label,
      meaning: `Universal rank ${idx + 1} card power and thematic weight.`,
      composition_rule: `Classic playing card framing with symmetrical pips and ornamental corners.`,
      archetype: idx >= 10 ? "Court Figure" : `Pip Tier ${idx + 1}`,
    })),
  },
  {
    id: "tcg_factions",
    name: "TCG / CCG Factions & Tiers",
    category: "Card Games",
    description:
      "5 Element Factions (Light, Fire, Water, Nature, Shadow) across 6 Rarity & Power Tiers (Initiate to Titan).",
    subgroups: [
      {
        id: "solar",
        label: "Solar / Light Faction",
        element: "Radiance / Order / Healing",
        theme: "Protection, divine hierarchy, justice, absolute certainty",
        palette: "Solar Gold, Radiant White, Cerulean, Opal",
        motifs: "Sunbursts, winged helms, pristine crystal, sacred shields",
        notes: "High key lighting and grand architectural lines.",
      },
      {
        id: "pyro",
        label: "Flame / Fire Faction",
        element: "Combustion / Rage / Momentum",
        theme: "Aggression, direct force, sudden strikes, destruction",
        palette: "Molten Orange, Crimson, Ash Black, Sulphur",
        motifs: "Volcanic glass, jagged daggers, ember sparks, dragons",
        notes: "High contrast fire glow and heavy motion blur.",
      },
      {
        id: "hydro",
        label: "Tide / Water Faction",
        element: "Depth / Subterfuge / Flow",
        theme: "Control, flexibility, deception, patient attrition",
        palette: "Abyssal Navy, Turquoise, Bioluminescent Cyan",
        motifs:
          "Deep sea horrors, trident runes, misty fog, spiraling vortices",
        notes: "Caustic light reflections and atmospheric depth.",
      },
      {
        id: "flora",
        label: "Grove / Nature Faction",
        element: "Biomass / Evolution / Instinct",
        theme: "Unchecked growth, brute endurance, wild symbiosis",
        palette: "Emerald, Moss, Bark Brown, Spore Chartreuse",
        motifs: "Living root armor, antlered behemoths, ancient canopy trees",
        notes: "Organic textures, dense foliage, and earthy rim lighting.",
      },
      {
        id: "void",
        label: "Void / Shadow Faction",
        element: "Entropy / Negation / Reanimation",
        theme: "Corruption, sacrifice, inevitability, forgotten lore",
        palette: "Obsidian, Muted Violet, Bone Ivory, Eerie Green",
        motifs: "Shattered mirrors, shadowy tendrils, skeletal crowns, crypts",
        notes: "Chiaroscuro lighting, deep shadows, and ominous silhouettes.",
      },
    ],
    ranks: [
      {
        rankIndex: 0,
        rankLabel: "Tier 1: Common / Initiate",
        meaning:
          "Basic frontline combatant, resource gathering, foundational utility.",
        composition_rule:
          "Wide ground shot showing multiple units or simple equipment.",
        archetype: "The Grunt / Initiate",
      },
      {
        rankIndex: 1,
        rankLabel: "Tier 2: Uncommon / Specialist",
        meaning:
          "Tactical specialization, skill synergy, versatile midgame answers.",
        composition_rule:
          "Dynamic medium shot demonstrating unique magical/weapon capability.",
        archetype: "The Adept / Scout",
      },
      {
        rankIndex: 2,
        rankLabel: "Tier 3: Rare / Elite Vanguard",
        meaning:
          "Battlefield turning point, powerful passive aura, high threat level.",
        composition_rule:
          "Low angle heroic profile with distinct power manifestation.",
        archetype: "The Champion / Captain",
      },
      {
        rankIndex: 3,
        rankLabel: "Tier 4: Epic / Artifact Engine",
        meaning:
          "High mana pinnacle, game-defining strategy enabler, legendary relic.",
        composition_rule:
          "Colossal focal object or spell blast breaking the frame border.",
        archetype: "The Paragon / Relic",
      },
      {
        rankIndex: 4,
        rankLabel: "Tier 5: Legendary Mythic",
        meaning: "Faction supreme avatar, cataclysmic win condition.",
        composition_rule:
          "Panoramic spectacle with reality-warping atmospheric scale.",
        archetype: "The Sovereign Avatar",
      },
      {
        rankIndex: 5,
        rankLabel: "Tier 6: Titan / Raid Boss",
        meaning: "Endgame world boss or colossal game-ending entity.",
        composition_rule:
          "Towering monolithic scale breaking out of the card frame.",
        archetype: "The World Ender / Colossus",
      },
    ],
  },
  {
    id: "board_game",
    name: "Board Game Components (4 Types × 6 Levels)",
    category: "Board Games",
    description:
      "Resources, Infrastructure, Tactics, and Hazards across 6 Escalating Progression Stages.",
    subgroups: [
      {
        id: "resources",
        label: "Resource & Production Tiles",
        element: "Economy / Material / Logistics",
        theme: "Generation, storage, supply line efficiency, raw goods",
        palette: "Woodland Ochre, Stone Grey, Iron Metallic, Grain Yellow",
        motifs: "Quarries, lumber mills, smelting furnaces, trade wagons",
      },
      {
        id: "structures",
        label: "Structures & Civil Buildings",
        element: "Infrastructure / Territory / Defense",
        theme: "Permanent upgrades, victory point generators, defense towers",
        palette: "Granite Grey, Slate Blue, Masonry White, Terracotta Tile",
        motifs: "Fortresses, aqueducts, research towers, city gates",
      },
      {
        id: "actions",
        label: "Tactical & Political Actions",
        element: "Strategy / Tempo / Diplomacy",
        theme: "Instant event resolution, military maneuvers, decree drafts",
        palette: "Parchment Tan, Wax Seal Red, Royal Indigo",
        motifs: "Embossed seals, rolled maps, council chambers, cavalry flags",
      },
      {
        id: "events",
        label: "Encounter & Hazard Events",
        element: "Fate / Danger / Opportunity",
        theme: "Disruptions, wandering monsters, sudden harvest boons, seasons",
        palette: "Storm Charcoal, Toxic Amber, Frost Cyan",
        motifs: "Tempest clouds, dragon shadow over valley, collapsed bridges",
      },
    ],
    ranks: Array.from({ length: 6 }, (_, i) => ({
      rankIndex: i,
      rankLabel: `Stage / Level ${i + 1}`,
      meaning: `Progression tier ${i + 1} with escalating costs and multiplied reward outputs.`,
      composition_rule: `Visual complexity tier ${i + 1} with richer detailing and prominent level pip badge.`,
      archetype: `Tier ${i + 1} Blueprint`,
    })),
  },
  {
    id: "narrative_arc",
    name: "Narrative Arc & Storyboard Beats",
    category: "Story & Art",
    description:
      "4 Story Acts (Departure, Initiation, Climax, Return) across 6 Core Character Roles.",
    subgroups: [
      {
        id: "act1",
        label: "Act I: Departure & Call",
        element: "The Known World",
        theme:
          "Status quo, the inciting incident, refusal, crossing the threshold",
        palette: "Sepia, Morning Mist, Gentle Amber, Familiar Green",
        motifs:
          "Homestead gates, ancient letters, departure crossroads, hearths",
      },
      {
        id: "act2",
        label: "Act II: The Descent & Trials",
        element: "The Unfamiliar Wilds",
        theme: "Tests, allies, enemies, navigating the belly of the whale",
        palette: "Fog Charcoal, Poison Green, Twilight Purple, Rust",
        motifs:
          "Labyrinths, broken bridges, campfire whispers, subterranean ruins",
      },
      {
        id: "act3",
        label: "Act III: The Climax & Ordeal",
        element: "The Center of the Fire",
        theme:
          "Confronting the core fear, sacrifice, revelation, seizing the boon",
        palette: "Blinding Crimson, Solar Flare, Obsidian, Lightning White",
        motifs: "Eclipse, shattered mirrors, divine relic, battlefield apex",
      },
      {
        id: "act4",
        label: "Act IV: Return & Transfiguration",
        element: "The Transformed World",
        theme:
          "The road back, resurrection, master of two worlds, freedom to live",
        palette: "Golden Dawn, Opal, Sky Blue, Radiant Emerald",
        motifs: "Banners of renewal, ancient crown laid down, open horizons",
      },
    ],
    ranks: [
      {
        rankIndex: 0,
        rankLabel: "Role: The Protagonist / Seeker",
        meaning:
          "Central bearer of the arc whose internal choice shapes the narrative trajectory.",
        composition_rule:
          "Close up emotional focal framing emphasizing gaze and decisive intent.",
        archetype: "The Seeker",
      },
      {
        rankIndex: 1,
        rankLabel: "Role: The Mentor / Guide",
        meaning: "Imparting wisdom, talismans, and unavoidable hard truths.",
        composition_rule:
          "Side profile or illuminated guide figure holding a light source.",
        archetype: "The Elder / Mentor",
      },
      {
        rankIndex: 2,
        rankLabel: "Role: The Shadow / Antagonist",
        meaning:
          "External mirror of the protagonist's repressed truth or opposing philosophy.",
        composition_rule:
          "Imposing silhouette or stark chiaroscuro shadow across the frame.",
        archetype: "The Adversary",
      },
      {
        rankIndex: 3,
        rankLabel: "Role: The Ally / Companion",
        meaning:
          "Loyalty, comic relief, grounded perspective, or mutual sacrifice.",
        composition_rule:
          "Shared two-shot composition standing shoulder-to-shoulder.",
        archetype: "The Loyal Companion",
      },
      {
        rankIndex: 4,
        rankLabel: "Role: The Threshold Guardian",
        meaning:
          "The test of resolve standing between the known and unknown worlds.",
        composition_rule:
          "Massive looming obstacle or gateway blocking direct passage.",
        archetype: "The Gatekeeper",
      },
      {
        rankIndex: 5,
        rankLabel: "Role: The World / Environment",
        meaning:
          "The setting as an active character exerting pressure on all actors.",
        composition_rule: "Panoramic wide environmental matte shot.",
        archetype: "The Living World",
      },
    ],
  },
  {
    id: "character_sprites",
    name: "Character Concept & Action Pose Sheet",
    category: "Story & Art",
    description: "4 Archetype Classes across 6 Pose & Action Animation States.",
    subgroups: [
      {
        id: "warrior",
        label: "Warrior / Vanguard Class",
        element: "Heavy Plate & Steel",
        theme:
          "Brute resilience, stance control, sweeping cleaves, shield bashes",
        palette: "Iron Grey, Blood Orange, Burnished Brass, Dark Leather",
        motifs: "Greatswords, tower shields, scarred plate, heavy greaves",
      },
      {
        id: "mage",
        label: "Mage / Spellweaver Class",
        element: "Arcane & Elements",
        theme:
          "Channeling, mana overload, floating sigils, spatial teleportation",
        palette: "Arcane Violet, Cobalt Blue, Luminescent Cyan, Starlight",
        motifs: "Rune tomes, floating staves, glowing glyph circles, robes",
      },
      {
        id: "rogue",
        label: "Rogue / Infiltrator Class",
        element: "Shadow & Poison",
        theme: "Agility, critical precision, stealth vanishes, dual daggers",
        palette: "Midnight Charcoal, Poison Jade, Muted Bronze, Smoke",
        motifs: "Throwing knives, grappling hooks, hooded cloaks, smoke vials",
      },
      {
        id: "cleric",
        label: "Cleric / Radiant Healer",
        element: "Sacred Light & Wards",
        theme: "Blessings, resurrective bursts, protective barriers, smite",
        palette: "Ivory White, Dawn Gold, Warm Topaz, Celestial Sky",
        motifs: "Sacred censers, winged maces, halo circlets, prayer seals",
      },
    ],
    ranks: [
      {
        rankIndex: 0,
        rankLabel: "Pose 1: Idle & Combat Stance",
        meaning:
          "Relaxed yet ready silhouette showing weapon balance and posture.",
        composition_rule: "Full body 3/4 hero view in rest posture.",
        archetype: "Resting Silhouette",
      },
      {
        rankIndex: 1,
        rankLabel: "Pose 2: Kinetic Run / Dash",
        meaning: "Dynamic forward velocity and weight distribution in motion.",
        composition_rule:
          "Strong diagonal stride line with cloth/trail motion blur.",
        archetype: "Kinetic Motion",
      },
      {
        rankIndex: 2,
        rankLabel: "Pose 3: Primary Attack / Strike",
        meaning: "Moment of maximum impact and weapon apex follow-through.",
        composition_rule:
          "Apex arc trail or muzzle flash with extreme dynamic foreshortening.",
        archetype: "Impact Apex",
      },
      {
        rankIndex: 3,
        rankLabel: "Pose 4: Signature Skill / Cast",
        meaning: "Ultimate ability charging or spell activation burst.",
        composition_rule:
          "VFX burst radiating outward with glowing rim lighting.",
        archetype: "Power Burst",
      },
      {
        rankIndex: 4,
        rankLabel: "Pose 5: Damage / Stun / Defeat",
        meaning: "Reaction to impact, staggering recoil or defensive parry.",
        composition_rule:
          "Off-balance backward recoil with dynamic particle debris.",
        archetype: "Recoil Reaction",
      },
      {
        rankIndex: 5,
        rankLabel: "Pose 6: Victory / Ascendant Pose",
        meaning: "Post-battle celebration, weapon flourish, or ascended form.",
        composition_rule:
          "Elevated angle with triumphant lighting and clean silhouette.",
        archetype: "Victory Flourish",
      },
    ],
  },
  {
    id: "design_tokens",
    name: "Design System & Asset Kit (6 Types × 4 States)",
    category: "Design & UI",
    description:
      "UI Components (Icons, Badges, Cards, Inputs, Modals, Buttons) across 4 Interactive States.",
    subgroups: [
      {
        id: "icons",
        label: "Icons / Glyphs",
        element: "24px Micro Geometry",
        theme: "Action signifiers and wayfinding cues",
      },
      {
        id: "badges",
        label: "Badges / Status Tags",
        element: "Compact Pill Geometry",
        theme: "Metadata labels and state indicators",
      },
      {
        id: "cards",
        label: "Cards / Deliverable Slots",
        element: "Container Geometry",
        theme: "Primary content surface and interactive slot",
      },
      {
        id: "inputs",
        label: "Inputs / Form Controls",
        element: "Control Surface",
        theme: "Data entry and selectable switches",
      },
      {
        id: "modals",
        label: "Modals / Flyouts",
        element: "Overlay Surface",
        theme: "Focused user confirmation dialogs",
      },
      {
        id: "buttons",
        label: "Buttons / Action Triggers",
        element: "Tactile CTA",
        theme: "Primary, secondary, and destructive actions",
      },
    ],
    ranks: [
      {
        rankIndex: 0,
        rankLabel: "State: Default / Rest",
        meaning: "Clean neutral surface in idle unselected state.",
      },
      {
        rankIndex: 1,
        rankLabel: "State: Hover / Focus",
        meaning:
          "Subtle luminance lift with distinct accessibility focus ring.",
      },
      {
        rankIndex: 2,
        rankLabel: "State: Active / Selected",
        meaning: "High contrast accent fill with solid indicator pip.",
      },
      {
        rankIndex: 3,
        rankLabel: "State: Muted / Disabled",
        meaning: "Desaturated low opacity state with no pointer events.",
      },
    ],
  },
  {
    id: "custom_blank",
    name: "Custom Blank Matrix (Clean Slate)",
    category: "Custom",
    description:
      "Start completely fresh with clean, customizable dimensions ready for your custom labels, themes, and briefs.",
    subgroups: [
      {
        id: "dim_1",
        label: "Dimension 1",
        element: "Element / Domain",
        theme: "Core theme notes...",
        palette: "Palette notes...",
        motifs: "Key motifs...",
      },
      {
        id: "dim_2",
        label: "Dimension 2",
        element: "Element / Domain",
        theme: "Core theme notes...",
        palette: "Palette notes...",
        motifs: "Key motifs...",
      },
      {
        id: "dim_3",
        label: "Dimension 3",
        element: "Element / Domain",
        theme: "Core theme notes...",
        palette: "Palette notes...",
        motifs: "Key motifs...",
      },
      {
        id: "dim_4",
        label: "Dimension 4",
        element: "Element / Domain",
        theme: "Core theme notes...",
        palette: "Palette notes...",
        motifs: "Key motifs...",
      },
    ],
    ranks: [
      {
        rankIndex: 0,
        rankLabel: "Stage 1",
        meaning: "Initial stage meaning...",
        archetype: "Stage 1 Role",
        composition_rule: "Framing rule...",
      },
      {
        rankIndex: 1,
        rankLabel: "Stage 2",
        meaning: "Intermediate stage meaning...",
        archetype: "Stage 2 Role",
        composition_rule: "Framing rule...",
      },
      {
        rankIndex: 2,
        rankLabel: "Stage 3",
        meaning: "Advanced stage meaning...",
        archetype: "Stage 3 Role",
        composition_rule: "Framing rule...",
      },
      {
        rankIndex: 3,
        rankLabel: "Stage 4",
        meaning: "Culmination stage meaning...",
        archetype: "Stage 4 Role",
        composition_rule: "Framing rule...",
      },
    ],
  },
];

/**
 * Initializes or resolves planning matrix data for a project.
 */
export function getOrInitPlanningMatrix(project: Project): PlanningMatrixData {
  const existing = project.metadata?.planning_matrix;
  if (existing && existing.subgroups.length > 0 && existing.ranks.length > 0) {
    return existing;
  }

  // Default to rich Tarot presets
  return {
    subgroups: [...TAROT_SUBGROUPS],
    ranks: [...TAROT_RANKS],
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

  const subLabel = subgroup?.label?.split("/")[0]?.trim() || "Dimension";
  const element = subgroup?.element || "Domain Attribute";
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

  doc += `## 1. Subgroup & Category Dimensions (Vertical Archetypes)\n\n`;
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
  doc += `| Rank / Stage | Meaning & Archetype | Compositional Framing Rule |\n`;
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
