/** Shared test harness: render the app with a fresh zero-latency mock client. */
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { App } from '../App';
import { MockBackendClient } from '../api/mockClient';
import { BoardProvider } from '../state/store';

export function makeClient(opts: { latency?: number; jobTickMs?: number } = {}) {
  return new MockBackendClient({ latency: opts.latency ?? 0, jobTickMs: opts.jobTickMs ?? 5 });
}

export function renderApp(client: MockBackendClient) {
  const utils = render(
    <BoardProvider client={client}>
      <App />
    </BoardProvider>,
  );
  return { client, ...utils };
}

/** Create + open a project through the UI forms at a fixed test path. */
export const TEST_PROJECT_PATH = '/tmp/p';

export async function createProjectViaUi(name = 'Test Deck', socketCount = 4) {
  const client = makeClient();
  const utils = renderApp(client);
  const user = userEvent.setup();
  await user.type(utils.getByTestId('project-name-input'), name);
  const countInput = utils.getByTestId('socket-count-input');
  await user.clear(countInput);
  await user.type(countInput, String(socketCount));
  await user.type(utils.getByTestId('project-path-input'), TEST_PROJECT_PATH);
  await user.click(utils.getByRole('button', { name: /create project/i }));
  await waitFor(() => expect(utils.getByRole('grid')).toBeInTheDocument());
  return { user, ...utils };
}
