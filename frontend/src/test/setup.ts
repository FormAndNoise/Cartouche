import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals are off, so RTL's automatic afterEach(cleanup) never wires
// up — do it explicitly or renders accumulate across tests.
afterEach(() => {
  cleanup();
});

// jsdom does not implement URL.createObjectURL / revokeObjectURL.
if (typeof URL.createObjectURL !== 'function') {
  let n = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => `blob:mock-${++n}`,
    writable: true,
  });
}
if (typeof URL.revokeObjectURL !== 'function') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => undefined,
    writable: true,
  });
}

// jsdom lacks scrollIntoView used by some focus management paths.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}
