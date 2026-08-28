/**
 * Licensing & Rights Management for Cartouche.
 *
 * Implements industry-standard rights structures:
 * - PLUS Coalition (Picture Licensing Universal System / IPTC / ISO 19566-5)
 * - Commercial Print & Deck Publishing rights
 * - Creative Commons (CC 4.0 / CC0)
 * - IPTC 2023+ AI Training / Data Mining Consent Standards
 */
import type {
 Project,
 ProjectMetadata,
 Socket,
 SocketMetadata,
} from "../api/types";

export interface LicensePreset {
 id: string;
 label: string;
 category:
 "commercial" | "plus" | "creative_commons" | "public_domain" | "ai_policy";
 description: string;
 spdxOrPlusCode?: string;
 recommendedFor?: string;
}

export const LICENSE_PRESETS: LicensePreset[] = [
 // Commercial & Print Publishing
 {
 id: "all_rights_reserved",
 label: "All Rights Reserved",
 category: "commercial",
 description:
 "Full proprietary copyright retained by author/publisher. No reproduction without express permission.",
 recommendedFor: "Standard commercial proprietary decks",
 },
 {
 id: "commercial_deck_exclusive_1st",
 label: "Commercial Print Deck — Exclusive 1st Edition",
 category: "commercial",
 description:
 "Exclusive physical card deck and packaging rights granted for initial print run.",
 recommendedFor: "Crowdfunded or limited first edition decks",
 },
 {
 id: "commercial_deck_nonexclusive",
 label: "Commercial Print & Digital — Non-Exclusive",
 category: "commercial",
 description:
 "Non-exclusive commercial reproduction rights for physical card decks, guidebooks, and companion apps.",
 recommendedFor: "General commercial publication & licensing",
 },
 {
 id: "work_for_hire",
 label: "Work for Hire / Full Rights Buyout",
 category: "commercial",
 description:
 "All intellectual property, publishing, and merchandising rights assigned to publisher/studio.",
 recommendedFor: "Studio-commissioned card illustrations",
 },
 {
 id: "limited_art_print_1000",
 label: "Limited Edition Print Run (Up to 1,000 Units)",
 category: "commercial",
 description:
 "Reproduction restricted to a single manufacturing run of max 1,000 physical units.",
 recommendedFor: "Fine art / boutique card editions",
 },

 // PLUS Universal Licensing System (IPTC / ISO/IEC 19566-5)
 {
 id: "plus_deck_excl_1st",
 label: "PLUS: Card Deck Physical Packaging (Exclusive 1st)",
 category: "plus",
 spdxOrPlusCode: "PLUS-LIC-DECK-EXCL-1ST",
 description:
 "PLUS Media Matrix: Physical Card Deck / Box Packaging, Exclusive First Run.",
 recommendedFor: "Industry-standard DAM & prepress interchange",
 },
 {
 id: "plus_deck_nonexcl",
 label: "PLUS: Card Deck (Non-Exclusive)",
 category: "plus",
 spdxOrPlusCode: "PLUS-LIC-DECK-NONEXCL",
 description:
 "PLUS Media Matrix: Physical Card Deck, Non-Exclusive Commercial Distribution.",
 recommendedFor: "Stock or multi-publisher illustration licensing",
 },
 {
 id: "plus_commercial_unlimited",
 label: "PLUS: Commercial Unlimited Print & Digital",
 category: "plus",
 spdxOrPlusCode: "PLUS-LIC-COMMERCIAL-UNLIMITED",
 description:
 "PLUS Media Matrix: Unlimited Global Print & Electronic Reproduction.",
 recommendedFor: "Enterprise & multi-platform releases",
 },

 // Creative Commons (4.0 & CC0)
 {
 id: "cc_by_4_0",
 label: "Creative Commons Attribution (CC BY 4.0)",
 category: "creative_commons",
 spdxOrPlusCode: "CC-BY-4.0",
 description:
 "Free sharing and adaptation for any purpose (commercial included), provided credit is given.",
 recommendedFor: "Open source tarot & community art decks",
 },
 {
 id: "cc_by_nc_4_0",
 label: "Creative Commons Non-Commercial (CC BY-NC 4.0)",
 category: "creative_commons",
 spdxOrPlusCode: "CC-BY-NC-4.0",
 description:
 "Allows sharing and remixing for non-commercial purposes with attribution.",
 recommendedFor: "Free downloadable print-and-play decks",
 },
 {
 id: "cc_by_nc_sa_4_0",
 label: "CC Non-Commercial Share-Alike (CC BY-NC-SA 4.0)",
 category: "creative_commons",
 spdxOrPlusCode: "CC-BY-NC-SA-4.0",
 description:
 "Non-commercial distribution; derivative works must be released under identical terms.",
 recommendedFor: "Collaborative indie decks & game jams",
 },
 {
 id: "cc_by_nd_4_0",
 label: "CC Attribution No-Derivatives (CC BY-ND 4.0)",
 category: "creative_commons",
 spdxOrPlusCode: "CC-BY-ND-4.0",
 description:
 "Commercial and non-commercial reuse allowed, but artwork cannot be modified or remixed.",
 recommendedFor: "Fixed visual identity card series",
 },
 {
 id: "cc0_1_0",
 label: "Public Domain Dedication (CC0 1.0)",
 category: "public_domain",
 spdxOrPlusCode: "CC0-1.0",
 description:
 "Dedicates artwork to the public domain worldwide. No rights reserved.",
 recommendedFor: "Historical restorations & public domain assets",
 },
];

export const AI_TRAINING_POLICIES = [
 {
 value: "AI: Prohibited (IPTC Data Mining: Forbidden / DNT)",
 label: "Prohibited / Opt-Out (IPTC DNT: No AI Training / Scraping)",
 description:
 "Strictly forbids AI ingestion, scraping, and machine learning training under IPTC 2023+ standards.",
 },
 {
 value: "AI: Permitted (IPTC Data Mining: Allowed)",
 label: "Permitted (IPTC Data Mining: Allowed)",
 description: "Permits AI model training and data extraction.",
 },
 {
 value: "AI: Permitted with Attribution Only",
 label: "Permitted with Attribution (Attribution Required)",
 description:
 "Permits AI training provided generative derivatives preserve creator attribution.",
 },
 {
 value: "",
 label: "Unspecified / Standard Copyright",
 description: "No explicit machine-learning metadata tag attached.",
 },
];

/**
 * Formats a clean, high-impact legal copyright and rights statement.
 */
export function formatRightsSummary(
 projectMeta?: ProjectMetadata | null,
 socketMeta?: SocketMetadata | null,
): string {
 const parts: string[] = [];

 const copyright = projectMeta?.copyright?.trim();
 if (copyright) {
 parts.push(copyright);
 } else {
 const author =
 socketMeta?.author_override?.trim() || projectMeta?.author?.trim();
 const studio = projectMeta?.studio?.trim();
 const year = new Date().getFullYear();
 if (author && studio && author !== studio) {
 parts.push(`© ${year} ${author} / ${studio}`);
 } else if (author || studio) {
 parts.push(`© ${year} ${author || studio}`);
 }
 }

 const effectiveLicense =
 socketMeta?.license_override?.trim() || projectMeta?.license?.trim();
 if (effectiveLicense) {
 parts.push(effectiveLicense);
 }

 return parts.length > 0 ? parts.join(" • ") : "No rights specified";
}

/**
 * Resolves the effective author and license for a given socket.
 */
export function resolveEffectiveRights(
 socket: Socket,
 project?: Project | null,
): {
 author: string;
 isAuthorOverridden: boolean;
 license: string;
 isLicenseOverridden: boolean;
} {
 const projectAuthor = project?.metadata?.author?.trim() ?? "";
 const socketAuthor = socket?.metadata?.author_override?.trim() ?? "";
 const isAuthorOverridden = socketAuthor.length > 0;
 const author = isAuthorOverridden ? socketAuthor : projectAuthor;

 const projectLicense = project?.metadata?.license?.trim() ?? "";
 const socketLicense = socket?.metadata?.license_override?.trim() ?? "";
 const isLicenseOverridden = socketLicense.length > 0;
 const license = isLicenseOverridden ? socketLicense : projectLicense;

 return {
 author: author || "Unspecified",
 isAuthorOverridden,
 license: license || "All Rights Reserved",
 isLicenseOverridden,
 };
}

/**
 * Generates a ready-to-import CSV template string with rights metadata headers and sample rows.
 */
export function generateSampleCsvTemplate(): string {
 return [
 "title,status,medium,tags,due_date,author,license,notes",
 '"00 - The Fool","done","Digital Ink & Gouache","major,air,wanderer","2026-09-01","Studio Lead","Commercial Print Deck — Exclusive 1st Edition","Opening archetype, primary card"',
 '"01 - The Magician","in_progress","Oil on Canvas","major,fire,mercury","2026-09-15","Studio Lead","PLUS-LIC-DECK-EXCL-1ST","Dual infinite motif with table tools"',
 '"02 - The High Priestess","needs_review","Watercolor & Gold Leaf","major,water,moon","2026-09-30","Guest Illustrator","Work for Hire / Full Rights Buyout","Veil of pomegranates behind pillars"',
 '"03 - The Empress","not_started","Mixed Media Collage","major,earth,venus","2026-10-15","Studio Lead","CC-BY-NC-4.0","Crown of twelve twelve-pointed stars"',
 '"04 - The Emperor","not_started","Digital Vector","major,fire,aries","2026-10-30","Studio Lead","All Rights Reserved","Stone throne with ram carvings"',
 ].join("\n");
}

/**
 * Triggers a browser/webview download of a string content as a named file.
 */
export function downloadTextFile(
 filename: string,
 content: string,
 mimeType = "text/plain;charset=utf-8",
) {
 const blob = new Blob([content], { type: mimeType });
 const url = URL.createObjectURL(blob);
 const anchor = document.createElement("a");
 anchor.href = url;
 anchor.download = filename;
 document.body.appendChild(anchor);
 anchor.click();
 document.body.removeChild(anchor);
 URL.revokeObjectURL(url);
}

/**
 * Generates a complete, professional Markdown rights manifest for the entire project.
 */
export function generateRightsManifestMarkdown(project: Project): string {
 const meta = project.metadata ?? {};
 const dateStr = new Date().toISOString().split("T")[0];

 const lines: string[] = [
 `# Rights & Deliverable Manifest — ${project.name}`,
 `_Generated: ${dateStr} by Cartouche (Form & Noise)_`,
 "",
 "## 1. Deck Identification & Attribution",
 "",
 `- **Deck Name**: ${project.name}`,
 `- **Edition / Version**: ${meta.edition || "1st Edition"}`,
 `- **Primary Author / Artist**: ${meta.author || "Unspecified"}`,
 `- **Studio / Publisher**: ${meta.studio || "Unspecified"}`,
 `- **Copyright Notice**: ${meta.copyright || "© " + new Date().getFullYear() + " " + (meta.author || meta.studio || "Studio")}`,
 `- **Deck Default License**: ${meta.license || "All Rights Reserved"}`,
 `- **Trademark**: ${meta.trademark || "None"}`,
 "",
 meta.description
 ? `### Description / Lore Premise\n\n${meta.description}\n`
 : "",
 "## 2. Card Deliverables & Licensing Inventory",
 "",
 "| # | Card Title | Status | Medium | Assigned Artist | Effective License | Winner Attached |",
 "| :---: | :--- | :---: | :--- | :--- | :--- | :---: |",
 ];

 for (const socket of project.sockets) {
 const rights = resolveEffectiveRights(socket, project);
 const hasWinner = socket.selected_work_id !== null ? "Yes" : "No";
 const statusLabel = socket.metadata.status.replace("_", " ");
 const medium = socket.metadata.medium || "—";
 const licenseDisplay = rights.isLicenseOverridden
 ? `**${rights.license}** *(override)*`
 : rights.license;
 const authorDisplay = rights.isAuthorOverridden
 ? `**${rights.author}** *(override)*`
 : rights.author;

 lines.push(
 `| ${socket.position} | ${socket.title} | ${statusLabel} | ${medium} | ${authorDisplay} | ${licenseDisplay} | ${hasWinner} |`,
 );
 }

 lines.push(
 "",
 "---",
 "",
 "## 3. Legal Notice & Prepress Instructions",
 "",
 "All deliverable image assets, vector linework, and document text listed in this manifest are managed through Cartouche.",
 "No commercial reproduction, plate generation, or distribution beyond the stated licenses is permitted without written consent from the rights holders.",
 );

 return lines.join("\n");
}
