import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { platform } from './platform/api';
import { App } from './ui/App';
import { BloomProvider } from './ui/store';
import './theme/tokens.css';
import './theme/app.css';

platform.load().then((snap) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BloomProvider initial={snap}>
        <App />
      </BloomProvider>
    </StrictMode>,
  );
});
