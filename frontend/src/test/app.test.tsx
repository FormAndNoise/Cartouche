/**
 * Component-level tests for the primary user flows.
 * Covers: project creation/opening (US-F01), grid + density (US-F02),
 * card states (US-F03), metadata editor (US-F04), keyboard nav (US-F10),
 * winner + lock UI (US-F07), and error states.
 */
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createProjectViaUi, makeClient, renderApp } from './harness';

describe('project selector & app shell (US-F01)', () => {
  it('shows the selector screen when no project is open (AC-F01.1)', () => {
    const { getByRole } = renderApp(makeClient());
    expect(getByRole('heading', { name: /tarot socket board/i })).toBeInTheDocument();
    expect(getByRole('form', { name: /create new project/i })).toBeInTheDocument();
    expect(getByRole('form', { name: /open existing project/i })).toBeInTheDocument();
  });

  it('creates a project and navigates to the grid (AC-F01.2)', async () => {
    const { getByRole } = await createProjectViaUi('My Deck', 6);
    const grid = getByRole('grid');
    expect(grid).toBeInTheDocument();
    expect(grid.querySelectorAll('.socket-card')).toHaveLength(6);
  });

  it('shows a structured error and does NOT navigate on failure (AC-F01.3)', async () => {
    const { getByText, queryByRole, getByRole, getByTestId } = renderApp(makeClient());
    const user = userEvent.setup();
    await user.type(getByTestId('project-name-input'), 'Bad Deck');
    const countInput = getByTestId('socket-count-input');
    await user.clear(countInput);
    await user.type(countInput, '0');
    await user.click(getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(getByText(/INVALID_SOCKET_COUNT/)).toBeInTheDocument());
    expect(queryByRole('grid')).not.toBeInTheDocument();
  });
});

describe('socket grid (US-F02)', () => {
  it('renders sockets in position order with the default column count (AC-F02.1)', async () => {
    const { getByRole } = await createProjectViaUi('Deck', 4);
    const grid = getByRole('grid');
    expect(grid).toHaveStyle({ '--cols': '3' }); // default density
    expect(grid.querySelectorAll('.socket-card')).toHaveLength(4);
  });

  it('re-flows immediately when column density changes (AC-F02.3)', async () => {
    const { getByRole, container } = await createProjectViaUi('Deck', 4);
    const user = userEvent.setup();
    await user.click(getByRole('button', { name: /2 columns/i }));
    await waitFor(() => {
      const grid = container.querySelector('.socket-grid');
      expect(grid).toHaveStyle({ '--cols': '2' });
    });
    expect(getByRole('button', { name: /2 columns/i })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('socket card states (US-F03)', () => {
  it('shows an empty-state placeholder for empty sockets (AC-F03.1)', async () => {
    const { getByText } = await createProjectViaUi('Deck', 1);
    expect(getByText(/empty socket/i)).toBeInTheDocument();
  });

  it('shows a lock icon when the socket is locked (AC-F03.3)', async () => {
    const { client, getByRole, container } = await createProjectViaUi('Deck', 1);
    const p = await client.getProject('/tmp/p');
    await client.setSocketLock({ project_path: p.path, socket_id: p.sockets[0].id, locked: true });
    const user = userEvent.setup();
    await user.click(getByRole('button', { name: /close project/i }));
    await user.type(getByRole('textbox', { name: /existing project path/i }), '/tmp/p');
    await user.click(getByRole('button', { name: /^open$/i }));
    await waitFor(() => expect(getByRole('grid')).toBeInTheDocument());
    expect(container.querySelector('.lock-icon')).toBeInTheDocument();
  });
});

describe('keyboard navigation (US-F10)', () => {
  it('moves focus with arrow keys following the column layout (AC-F10.1)', async () => {
    const { getByRole } = await createProjectViaUi('Deck', 4);
    const grid = getByRole('grid');
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.socket-card'));
    cards[0].focus();
    const user = userEvent.setup();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cards[1]);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(cards[0]);
    await user.keyboard('{ArrowDown}'); // default 3 columns -> down is +3
    expect(document.activeElement).toBe(cards[3]);
  });

  it('Enter opens the detail panel; Escape closes and returns focus (AC-F10.2)', async () => {
    const { getByRole, queryByRole } = await createProjectViaUi('Deck', 2);
    const grid = getByRole('grid');
    const first = grid.querySelectorAll<HTMLElement>('.socket-card')[0];
    first.focus();
    const user = userEvent.setup();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(getByRole('dialog', { name: /socket 1 details/i })).toBeInTheDocument());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(queryByRole('dialog', { name: /socket 1 details/i })).not.toBeInTheDocument());
    expect(document.activeElement).toBe(first);
  });
});

describe('metadata editor (US-F04)', () => {
  it('renders exactly the fixed schema fields; status is a select (AC-F04.1/.2)', async () => {
    const { getByRole, getByLabelText } = await createProjectViaUi('Deck', 1);
    getByRole('grid').querySelectorAll<HTMLElement>('.socket-card')[0].click();
    await waitFor(() => expect(getByRole('dialog', { name: /socket 1 details/i })).toBeInTheDocument());
    expect(getByLabelText(/^status$/i)).toBeInTheDocument();
    expect(getByLabelText(/^medium$/i)).toBeInTheDocument();
    expect(getByLabelText(/tags/i)).toBeInTheDocument();
    expect(getByLabelText(/due date/i)).toBeInTheDocument();
    expect(getByLabelText(/^status$/i).tagName.toLowerCase()).toBe('select');
  });

  it('persists a status change via update_socket (AC-F04.2)', async () => {
    const { client, getByRole, getByLabelText } = await createProjectViaUi('Deck', 1);
    getByRole('grid').querySelectorAll<HTMLElement>('.socket-card')[0].click();
    await waitFor(() => expect(getByRole('dialog', { name: /socket 1 details/i })).toBeInTheDocument());
    const user = userEvent.setup();
    await user.selectOptions(getByLabelText(/^status$/i), 'done');
    await waitFor(async () => {
      const p = await client.getProject('/tmp/p');
      expect(p.sockets[0].metadata.status).toBe('done');
    });
  });
});

describe('winner & lock UI (US-F07)', () => {
  it('unlock requires confirmation, then unlocks (AC-F07.3)', async () => {
    const { client, getByRole } = await createProjectViaUi('Deck', 1);
    const p = await client.getProject('/tmp/p');
    await client.setSocketLock({ project_path: p.path, socket_id: p.sockets[0].id, locked: true });
    const user = userEvent.setup();
    await user.click(getByRole('button', { name: /close project/i }));
    await user.type(getByRole('textbox', { name: /existing project path/i }), '/tmp/p');
    await user.click(getByRole('button', { name: /^open$/i }));
    await waitFor(() => expect(getByRole('grid')).toBeInTheDocument());
    getByRole('grid').querySelectorAll<HTMLElement>('.socket-card')[0].click();
    await waitFor(() => expect(getByRole('dialog', { name: /socket 1 details/i })).toBeInTheDocument());
    await user.click(getByRole('button', { name: /^unlock$/i }));
    const confirmDialog = getByRole('dialog', { name: /unlock this socket\?/i });
    expect(confirmDialog).toBeInTheDocument();
    const confirmBtn = Array.from(confirmDialog.querySelectorAll('button')).find((b) =>
      /^unlock$/i.test(b.textContent ?? ''),
    );
    expect(confirmBtn).toBeTruthy();
    await user.click(confirmBtn!);
    await waitFor(async () => {
      const fresh = await client.getProject('/tmp/p');
      expect(fresh.sockets[0].locked).toBe(false);
    });
  });
});

describe('CSV import UI (US-F08)', () => {
  const csv = 'title,notes,status\nCard A,first,done\nCard B,second,in_progress';

  it('previews before mutating, imports with progress, and shows a summary (AC-F08.1/.2/.3)', async () => {
    const { client, getByRole, getByText, getByTestId } = await createProjectViaUi('Deck', 4);
    const user = userEvent.setup();
    await user.click(getByRole('button', { name: /import csv/i }));

    // File input: jsdom has no real picker, so upload via the input element.
    const file = new File([csv], 'deck.csv', { type: 'text/csv' });
    const dialog = getByRole('dialog', { name: /import sockets from csv/i });
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    // Preview phase: headers shown, no mutation yet.
    await waitFor(() => expect(getByTestId('csv-preview-count')).toHaveTextContent(/2 data rows/i));
    expect(getByRole('table', { name: /csv preview/i })).toBeInTheDocument();
    const p1 = await client.getProject('/tmp/p');
    expect(p1.sockets.every((s) => s.title === '')).toBe(true);

    await user.click(getByRole('button', { name: /import 2 rows/i }));
    await waitFor(
      async () => {
        const fresh = await client.getProject('/tmp/p');
        expect(fresh.sockets[0].title).toBe('Card A');
        expect(fresh.sockets[1].title).toBe('Card B');
      },
      { timeout: 4000 },
    );
    await waitFor(() => expect(getByText(/import complete/i)).toBeInTheDocument());
    expect(getByText(/processed: 2/i)).toBeInTheDocument();
  });
});
