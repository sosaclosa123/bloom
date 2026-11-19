// The small always-on-top reminder window. It is created with focusable:false
// so showing it never steals focus from a game or anything else.
import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DeliveryReason } from './platform/bridge';
import type { FiredAlert, Language } from './shared/types';
import { AlertCards } from './ui/AlertCards';
import './theme/tokens.css';
import './theme/app.css';
import './theme/motion.css';

function Popup() {
  const bridge = window.bloomDesktop!.popup;
  const [state, setState] = useState<{ alerts: FiredAlert[]; reason: DeliveryReason; lang: Language } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = bridge.onAlerts((alerts, reason, lang, dark) => {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      setState({ alerts, reason, lang: lang as Language });
    });
    bridge.ready();
    return off;
  }, [bridge]);

  useLayoutEffect(() => {
    if (ref.current) bridge.resize(ref.current.getBoundingClientRect().height);
  }, [state, bridge]);

  if (!state) return null;
  return (
    <div ref={ref} className="popup-wrap">
      <AlertCards
        alerts={state.alerts}
        reason={state.reason}
        lang={state.lang}
        snoozeOptions={[10, 60]}
        onSnooze={(k, m) => bridge.snooze(k, m)}
        onDismiss={(k) => bridge.dismiss(k)}
        onDismissAll={() => bridge.dismissAll()}
        onOpen={(d) => bridge.open(d)}
      />
    </div>
  );
}

createRoot(document.getElementById('popup')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
