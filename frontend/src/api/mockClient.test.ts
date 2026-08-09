/**
 * Contract tests for MockBackendClient — proves the client module behaves
 * per docs/api.md and REQUIREMENTS.md before any UI code touches it.
 */
import { describe, expect, it } from 'vitest';
import { MockBackendClient, parseCsv } from './mockClient';
import { ApiError } from './types';

function newClient() {
  return new MockBackendClient({ latency: 0, jobTickMs: 5 });
}

async function withProject(client: MockBackendClient, socketCount = 4) {
  return client.createProject({ name: 'Test Deck', socket_count: socketCount, project_path: '/tmp/p' });
}

describe('create_project', () => {
  it('creates fixed-count ordered sockets (AC-B02.1)', async () => {
    const c = newClient();
    const p = await withProject(c, 7);
    expect(p.sockets).toHaveLength(7);
    expect(p.sockets.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(p.name).toBe('Test Deck');
  });

  it('rejects socket_count <= 0 with INVALID_SOCKET_COUNT (AC-B02.2)', async () => {
    const c = newClient();
    await expect(
      c.createProject({ name: 'X', socket_count: 0, project_path: '/tmp/x' }),
    ).rejects.toMatchObject({ code: 'INVALID_SOCKET_COUNT' });
  });

  it('rejects duplicate paths with PATH_NOT_WRITABLE', async () => {
    const c = newClient();
    await withProject(c);
    await expect(
      c.createProject({ name: 'X', socket_count: 2, project_path: '/tmp/p' }),
    ).rejects.toMatchObject({ code: 'PATH_NOT_WRITABLE' });
  });

  it('errors carry the structured envelope shape (US-B09)', async () => {
    const c = newClient();
    try {
      await c.createProject({ name: 'X', socket_count: -1, project_path: '/tmp/x' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('INVALID_SOCKET_COUNT');
      expect(typeof (e as ApiError).message).toBe('string');
    }
  });
});

describe('get_project', () => {
  it('returns NOT_FOUND for unknown paths (AC-B02.3)', async () => {
    const c = newClient();
    await expect(c.getProject('/nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('socket updates & lock policy', () => {
  it('persists title/notes edits (AC-B03.1)', async () => {
    const c = newClient();
    const p = await withProject(c);
    const s = await c.updateSocket({ project_path: p.path, socket_id: p.sockets[0].id, title: 'The Fool', notes: 'n' });
    expect(s.title).toBe('The Fool');
    const fresh = await c.getProject(p.path);
    expect(fresh.sockets[0].title).toBe('The Fool');
  });

  it('locked socket rejects content edits with LOCKED (AC-B03.2)', async () => {
    const c = newClient();
    const p = await withProject(c);
    const id = p.sockets[0].id;
    await c.setSocketLock({ project_path: p.path, socket_id: id, locked: true });
    await expect(
      c.updateSocket({ project_path: p.path, socket_id: id, title: 'nope' }),
    ).rejects.toMatchObject({ code: 'LOCKED' });
  });

  it('rejects invalid metadata status with VALIDATION_ERROR', async () => {
    const c = newClient();
    const p = await withProject(c);
    await expect(
      c.updateSocket({
        project_path: p.path,
        socket_id: p.sockets[0].id,
        metadata: { status: 'bogus' as never, medium: '', tags: '', due_date: null },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('reorder validates duplicates and missing ids (AC-B03.4)', async () => {
    const c = newClient();
    const p = await withProject(c, 3);
    const [a, b, d] = p.sockets.map((s) => s.id);
    await expect(c.reorderSockets({ project_path: p.path, ordered_socket_ids: [a, a, d] })).rejects.toMatchObject({
      code: 'DUPLICATE_ID',
    });
    await expect(c.reorderSockets({ project_path: p.path, ordered_socket_ids: [a, b] })).rejects.toMatchObject({
      code: 'MISSING_SOCKET',
    });
    const done = await c.reorderSockets({ project_path: p.path, ordered_socket_ids: [d, a, b] });
    expect(done.sockets.map((s) => s.id)).toEqual([d, a, b]);
    expect(done.sockets.map((s) => s.position)).toEqual([0, 1, 2]);
  });
});

describe('works & winner', () => {
  it('attaches a work and simulates preview/extraction lifecycles (US-B06/B07)', async () => {
    const c = newClient();
    const p = await withProject(c);
    const id = p.sockets[0].id;
    c.registerLocalFile('note.md', new Blob(['hello world'], { type: 'text/markdown' }));
    const s = await c.attachWork({ project_path: p.path, socket_id: id, source_path: 'note.md' });
    expect(s.works).toHaveLength(1);
    expect(s.works[0].extracted_text_state).toBe('pending');
    await new Promise((r) => setTimeout(r, 30));
    const fresh = await c.getProject(p.path);
    const w = fresh.sockets[0].works[0];
    expect(w.extracted_text_state).toBe('ready');
    expect(w.extracted_text).toBe('hello world');
  });

  it('locked socket rejects attach with LOCKED (AC-B04.4)', async () => {
    const c = newClient();
    const p = await withProject(c);
    const id = p.sockets[0].id;
    await c.setSocketLock({ project_path: p.path, socket_id: id, locked: true });
    await expect(c.attachWork({ project_path: p.path, socket_id: id, source_path: 'a.png' })).rejects.toMatchObject({
      code: 'LOCKED',
    });
  });

  it('select_winner hides nothing but sets selected_work_id; clear works (AC-F07.1)', async () => {
    const c = newClient();
    const p = await withProject(c);
    const id = p.sockets[0].id;
    c.registerLocalFile('a.png', new Blob(['1'], { type: 'image/png' }));
    c.registerLocalFile('b.png', new Blob(['2'], { type: 'image/png' }));
    await c.attachWork({ project_path: p.path, socket_id: id, source_path: 'a.png' });
    let s = await c.attachWork({ project_path: p.path, socket_id: id, source_path: 'b.png' });
    const winnerId = s.works[1].id;
    s = await c.selectWinner({ project_path: p.path, socket_id: id, work_id: winnerId });
    expect(s.selected_work_id).toBe(winnerId);
    expect(s.works).toHaveLength(2); // candidates are NOT deleted — only hidden in grid UI
    s = await c.selectWinner({ project_path: p.path, socket_id: id, work_id: null });
    expect(s.selected_work_id).toBeNull();
  });

  it('remove_work on the winner requires force (AC-B04.5)', async () => {
    const c = newClient();
    const p = await withProject(c);
    const id = p.sockets[0].id;
    c.registerLocalFile('a.png', new Blob(['1'], { type: 'image/png' }));
    const s = await c.attachWork({ project_path: p.path, socket_id: id, source_path: 'a.png' });
    const wid = s.works[0].id;
    await c.selectWinner({ project_path: p.path, socket_id: id, work_id: wid });
    await expect(c.removeWork({ project_path: p.path, socket_id: id, work_id: wid })).rejects.toMatchObject({
      code: 'IS_SELECTED',
    });
    const after = await c.removeWork({ project_path: p.path, socket_id: id, work_id: wid, force: true });
    expect(after.works).toHaveLength(0);
    expect(after.selected_work_id).toBeNull();
  });

  it('locked socket rejects drop with per-file LOCKED rejections (AC-F05.4)', async () => {
    const c = newClient();
    const p = await withProject(c);
    const id = p.sockets[0].id;
    await c.setSocketLock({ project_path: p.path, socket_id: id, locked: true });
    const r = await c.importDroppedFiles({ project_path: p.path, socket_id: id, paths: ['a.png', 'b.png'] });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(2);
    expect(r.rejected[0].code).toBe('LOCKED');
  });
});

describe('CSV import job', () => {
  const csv = ['title,notes,status,medium', 'Card A,first,done,ink', 'Card B,,bogus,watercolor', ',missing title,,'].join('\n');

  it('preview rejects missing required column (AC-B05.2)', async () => {
    const c = newClient();
    const p = await withProject(c);
    await expect(c.previewCsv({ project_path: p.path, csv_text: 'notes,status\nx,y' })).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_COLUMN',
    });
  });

  it('preview returns headers + first rows without mutating', async () => {
    const c = newClient();
    const p = await withProject(c);
    const preview = await c.previewCsv({ project_path: p.path, csv_text: csv });
    expect(preview.headers).toEqual(['title', 'notes', 'status', 'medium']);
    expect(preview.rows_total).toBe(3);
    expect(preview.rows).toHaveLength(3);
    const fresh = await c.getProject(p.path);
    expect(fresh.sockets.every((s) => s.title === '')).toBe(true);
  });

  it('runs to done with row-level warnings, skipping bad and locked rows (AC-B05.3/.4/.5)', async () => {
    const c = newClient();
    const p = await withProject(c, 6);
    // Lock the first socket so append mode must skip it.
    await c.setSocketLock({ project_path: p.path, socket_id: p.sockets[0].id, locked: true });

    const { job_id, rows_total } = await c.importCsv({ project_path: p.path, csv_text: csv, mode: 'append' });
    expect(rows_total).toBe(3);

    let status = await c.getJob({ project_path: p.path, job_id });
    let tries = 0;
    while (status.state !== 'done' && tries++ < 100) {
      await new Promise((r) => setTimeout(r, 10));
      status = await c.getJob({ project_path: p.path, job_id });
    }
    expect(status.state).toBe('done');
    expect(status.progress).toBe(100);
    expect(status.result).toMatchObject({ rows_total: 3, rows_processed: 1, rows_skipped: 2 });
    const codes = status.warnings.map((w) => w.code);
    expect(codes).toContain('LOCKED');
    expect(codes).toContain('ROW_VALIDATION_ERROR');

    const fresh = await c.getProject(p.path);
    expect(fresh.sockets[0].title).toBe(''); // locked row untouched
    expect(fresh.sockets[1].title).toBe('Card A');
    expect(fresh.sockets[1].metadata.status).toBe('done');
  });
});

describe('parseCsv', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n"x,y","say ""hi"""');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,y', 'say "hi"'],
    ]);
  });
});
