import { describe, expect, it } from "vitest";
import {
  LICENSE_PRESETS,
  AI_TRAINING_POLICIES,
  formatRightsSummary,
  resolveEffectiveRights,
  generateSampleCsvTemplate,
  generateRightsManifestMarkdown,
} from "../lib/licensing";
import type { Project, Socket } from "../api/types";

describe("Licensing & Rights Management (lib/licensing.ts)", () => {
  it("includes commercial, PLUS, creative commons, and public domain presets", () => {
    expect(LICENSE_PRESETS.length).toBeGreaterThan(5);

    const categories = new Set(LICENSE_PRESETS.map((p) => p.category));
    expect(categories.has("commercial")).toBe(true);
    expect(categories.has("plus")).toBe(true);
    expect(categories.has("creative_commons")).toBe(true);
    expect(categories.has("public_domain")).toBe(true);

    const plusPreset = LICENSE_PRESETS.find(
      (p) => p.spdxOrPlusCode === "PLUS-LIC-DECK-EXCL-1ST",
    );
    expect(plusPreset).toBeDefined();
    expect(plusPreset?.category).toBe("plus");

    const ccPreset = LICENSE_PRESETS.find(
      (p) => p.spdxOrPlusCode === "CC-BY-NC-4.0",
    );
    expect(ccPreset).toBeDefined();
    expect(ccPreset?.category).toBe("creative_commons");
  });

  it("provides IPTC 2023+ AI training policies", () => {
    expect(AI_TRAINING_POLICIES.length).toBeGreaterThanOrEqual(3);
    const dnt = AI_TRAINING_POLICIES.find((p) =>
      p.value.includes("Prohibited"),
    );
    expect(dnt).toBeDefined();
    expect(dnt?.label).toContain("Opt-Out");
  });

  it("formats rights summary using explicit copyright or derived authorship", () => {
    // Explicit copyright
    expect(
      formatRightsSummary({
        copyright: "© 2026 Form & Noise Atelier. All Rights Reserved.",
        license: "Commercial Print",
      }),
    ).toBe(
      "© 2026 Form & Noise Atelier. All Rights Reserved. • Commercial Print",
    );

    // Derived authorship with author & studio
    const year = new Date().getFullYear();
    expect(
      formatRightsSummary({
        author: "Studio Lead",
        studio: "Form & Noise",
        license: "CC-BY-4.0",
      }),
    ).toBe(`© ${year} Studio Lead / Form & Noise • CC-BY-4.0`);

    // Derived with card override
    expect(
      formatRightsSummary(
        { author: "Studio Lead", license: "All Rights Reserved" },
        {
          status: "done",
          medium: "Oil",
          tags: "",
          due_date: null,
          author_override: "Guest Artist",
          license_override: "Work for Hire",
        },
      ),
    ).toBe(`© ${year} Guest Artist • Work for Hire`);
  });

  it("resolves effective rights and tracks override state accurately", () => {
    const socketWithoutOverride: Socket = {
      id: "1",
      position: 1,
      title: "The Fool",
      notes: "",
      locked: false,
      selected_work_id: null,
      works: [],
      metadata: {
        status: "not_started",
        medium: "Digital",
        tags: "",
        due_date: null,
      },
    };

    const project: Project = {
      name: "Tarot Deck",
      path: "/test/deck",
      grid_columns: 3,
      metadata: {
        author: "Main Artist",
        license: "PLUS-LIC-DECK-EXCL-1ST",
      },
      sockets: [socketWithoutOverride],
    };

    // Inherited
    const resolvedInherited = resolveEffectiveRights(
      socketWithoutOverride,
      project,
    );
    expect(resolvedInherited.author).toBe("Main Artist");
    expect(resolvedInherited.isAuthorOverridden).toBe(false);
    expect(resolvedInherited.license).toBe("PLUS-LIC-DECK-EXCL-1ST");
    expect(resolvedInherited.isLicenseOverridden).toBe(false);

    // Overridden
    const socketWithOverride: Socket = {
      ...socketWithoutOverride,
      metadata: {
        ...socketWithoutOverride.metadata,
        author_override: "Guest Painter",
        license_override: "CC-BY-NC-4.0",
      },
    };

    const resolvedOverridden = resolveEffectiveRights(
      socketWithOverride,
      project,
    );
    expect(resolvedOverridden.author).toBe("Guest Painter");
    expect(resolvedOverridden.isAuthorOverridden).toBe(true);
    expect(resolvedOverridden.license).toBe("CC-BY-NC-4.0");
    expect(resolvedOverridden.isLicenseOverridden).toBe(true);
  });

  it("generates a CSV template containing headers and valid sample license values", () => {
    const template = generateSampleCsvTemplate();
    const lines = template.trim().split("\n");
    expect(lines[0]).toBe(
      "title,status,medium,tags,due_date,author,license,notes",
    );
    expect(lines.length).toBeGreaterThan(3);
    expect(template).toContain("Commercial Print Deck — Exclusive 1st Edition");
    expect(template).toContain("PLUS-LIC-DECK-EXCL-1ST");
    expect(template).toContain("Work for Hire / Full Rights Buyout");
    expect(template).toContain("CC-BY-NC-4.0");
  });

  it("generates a comprehensive Markdown rights manifest document", () => {
    const socket1: Socket = {
      id: "1",
      position: 1,
      title: "00 - The Fool",
      notes: "Opening card",
      locked: false,
      selected_work_id: "w1",
      works: [],
      metadata: {
        status: "done",
        medium: "Digital Ink",
        tags: "air",
        due_date: null,
      },
    };

    const socket2: Socket = {
      id: "2",
      position: 2,
      title: "01 - The Magician",
      notes: "Guest artwork",
      locked: true,
      selected_work_id: null,
      works: [],
      metadata: {
        status: "in_progress",
        medium: "Watercolor",
        tags: "fire",
        due_date: null,
        author_override: "Guest Master",
        license_override: "Work for Hire",
      },
    };

    const project: Project = {
      name: "Cartouche Arcana",
      path: "/projects/arcana",
      grid_columns: 3,
      metadata: {
        author: "Studio Director",
        studio: "Form & Noise",
        license: "PLUS-LIC-DECK-EXCL-1ST",
        edition: "Limited Kickstarter Edition",
        copyright: "© 2026 Form & Noise Atelier",
      },
      sockets: [socket1, socket2],
    };

    const doc = generateRightsManifestMarkdown(project);
    expect(doc).toContain("# Rights & Deliverable Manifest — Cartouche Arcana");
    expect(doc).toContain(
      "- **Edition / Version**: Limited Kickstarter Edition",
    );
    expect(doc).toContain("- **Primary Author / Artist**: Studio Director");
    expect(doc).toContain("- **Deck Default License**: PLUS-LIC-DECK-EXCL-1ST");
    expect(doc).toContain("Guest Master");
    expect(doc).toContain("Work for Hire");
  });

  it("handles CSV import with status synonyms like todo, wip, and complete", async () => {
    const { MockBackendClient } = await import("../api/mockClient");
    const client = new MockBackendClient({ latency: 0, jobTickMs: 1 });
    const p = await client.createProject({
      name: "Tarot 78",
      socket_count: 4,
      project_path: "/tmp/tarot78",
    });

    const csv = [
      "title,status,medium,tags,due_date,author,license,notes",
      '"The Fool","todo","Ink","major","2026-09-01","Artist A","All Rights Reserved","Notes A"',
      '"The Magician","wip","Oil","major","2026-09-02","Artist B","PLUS-LIC-DECK-EXCL-1ST","Notes B"',
      '"The High Priestess","review","Watercolor","major","2026-09-03","Artist C","CC-BY-NC-4.0","Notes C"',
      '"The Empress","complete","Digital","major","2026-09-04","Artist D","Work for Hire","Notes D"',
    ].join("\n");

    const job = await client.importCsv({
      project_path: p.path,
      csv_text: csv,
      mode: "update",
    });

    let jobStatus = await client.getJob({
      project_path: p.path,
      job_id: job.job_id,
    });
    for (let i = 0; i < 20 && jobStatus.state === "running"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      jobStatus = await client.getJob({
        project_path: p.path,
        job_id: job.job_id,
      });
    }
    expect(jobStatus.state).toBe("done");
    expect(jobStatus.result?.rows_processed).toBe(4);
    expect(jobStatus.result?.rows_skipped).toBe(0);
    expect(jobStatus.warnings.length).toBe(0);

    const updated = await client.getProject(p.path);
    expect(updated.sockets[0].metadata.status).toBe("not_started");
    expect(updated.sockets[1].metadata.status).toBe("in_progress");
    expect(updated.sockets[2].metadata.status).toBe("needs_review");
    expect(updated.sockets[3].metadata.status).toBe("done");
  });

  it("expands socket count to match CSV when CSV has more rows than initial project", async () => {
    const { MockBackendClient } = await import("../api/mockClient");
    const client = new MockBackendClient({ latency: 0, jobTickMs: 1 });
    const p = await client.createProject({
      name: "Small Deck",
      socket_count: 2,
      project_path: "/tmp/smalldeck",
    });

    const csv = [
      "title,status",
      "Card 1,done",
      "Card 2,done",
      "Card 3,in_progress",
      "Card 4,not_started",
      "Card 5,todo",
    ].join("\n");

    const job = await client.importCsv({
      project_path: p.path,
      csv_text: csv,
      mode: "update",
    });

    let jobStatus = await client.getJob({
      project_path: p.path,
      job_id: job.job_id,
    });
    for (let i = 0; i < 20 && jobStatus.state === "running"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      jobStatus = await client.getJob({
        project_path: p.path,
        job_id: job.job_id,
      });
    }
    expect(jobStatus.state).toBe("done");
    expect(jobStatus.result?.rows_processed).toBe(5);
    expect(jobStatus.result?.rows_skipped).toBe(0);

    const updated = await client.getProject(p.path);
    expect(updated.sockets.length).toBe(5);
    expect(updated.sockets[4].title).toBe("Card 5");
    expect(updated.sockets[4].metadata.status).toBe("not_started");
  });

  it("opens in external editor and syncs edits while maintaining forensic provenance ledger", async () => {
    const { MockBackendClient } = await import("../api/mockClient");
    const client = new MockBackendClient({ latency: 0, jobTickMs: 1 });
    const p = await client.createProject({
      name: "Provenance Deck",
      socket_count: 2,
      project_path: "/tmp/provdeck",
    });

    const s0 = p.sockets[0];
    const blob = new Blob(["MOCK_ARTWORK_V1"], { type: "image/png" });
    const localUrl = "blob:http://localhost:1420/mock-artwork-1";
    client.registerLocalFile(localUrl, blob);

    await client.importDroppedFiles({
      project_path: p.path,
      socket_id: s0.id,
      paths: [localUrl],
    });

    const withWork = await client.getProject(p.path);
    const work = withWork.sockets[0].works[0];
    expect(work).toBeDefined();

    // 1. Open in external editor
    const openRes = await client.openInExternalEditor({
      project_path: p.path,
      socket_id: s0.id,
      work_id: work.id,
    });
    expect(openRes.path).toContain(work.id);

    const sAfterOpen = await client.getProject(p.path);
    expect(sAfterOpen.sockets[0].metadata.provenance_ledger?.length).toBe(1);
    expect(sAfterOpen.sockets[0].metadata.provenance_ledger?.[0].event).toBe(
      "EXTERNAL_EDIT_OPENED",
    );

    // 2. Sync external modifications
    const syncRes = await client.syncExternalEdits({
      project_path: p.path,
      socket_id: s0.id,
      work_id: work.id,
    });
    expect(syncRes.modified).toBe(true);
    expect(syncRes.old_sha256).not.toBe(syncRes.new_sha256);

    const sAfterSync = await client.getProject(p.path);
    const ledger = sAfterSync.sockets[0].metadata.provenance_ledger;
    expect(ledger?.length).toBe(2);
    expect(ledger?.[1].event).toBe("EXTERNAL_EDIT_COMMITTED");
    expect(ledger?.[1].previous_sha256).toBe(syncRes.old_sha256);
    expect(ledger?.[1].sha256_hash).toBe(syncRes.new_sha256);

    // 3. Move artwork to socket 1
    const moved = await client.moveWork({
      project_path: p.path,
      source_socket_id: s0.id,
      target_socket_id: p.sockets[1].id,
      work_id: work.id,
    });
    expect(moved.sockets[0].works.length).toBe(0);
    expect(moved.sockets[1].works.length).toBe(1);
  });
});
