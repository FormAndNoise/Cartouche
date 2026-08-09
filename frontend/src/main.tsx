import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createBackendClient } from './api';
import { BoardProvider } from './state/store';
import './styles.css';

const client = createBackendClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BoardProvider client={client}>
      <App />
    </BoardProvider>
  </StrictMode>,
);
