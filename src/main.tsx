import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { platform, platformReady } from './platform/api';
import { App } from './ui/App';
import { BloomProvider } from './ui/store';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/caveat/600.css';
import '@fontsource/gveret-levin/400.css';
import '@fontsource/outfit/600.css';
import './theme/tokens.css';
import './theme/app.css';
import './theme/motion.css';
import './theme/phone.css';

platformReady.then(() => platform.load()).then((snap) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BloomProvider initial={snap}>
        <App />
      </BloomProvider>
    </StrictMode>,
  );
});
