// "Update ready" banner + the update row in Settings.
import { useEffect, useState } from 'react';
import { platform, type UpdateState } from '../platform/api';
import { Button } from './common';
import { useBloom } from './store';

export function useUpdateState() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  useEffect(() => {
    platform.getUpdateState().then(setState);
    return platform.onUpdateState(setState);
  }, []);
  return state;
}

// Phone: "Update available" downloads the new APK, then Android asks "Install?".
const phoneApp = () => platform.kind === 'android';

export function UpdateBanner() {
  const { t } = useBloom();
  const state = useUpdateState();
  const [hidden, setHidden] = useState<string | null>(null);
  if (phoneApp() && state.status === 'downloading' && hidden !== state.version)
    return (
      <div className="update-banner" role="status">
        <span className="update-emoji" aria-hidden="true">
          ✨
        </span>
        <span>{t('updateDownloading', { v: state.version, p: state.percent })}</span>
      </div>
    );
  if (state.status !== 'ready' || hidden === state.version) return null;
  return (
    <div className="update-banner" role="status">
      <span className="update-emoji" aria-hidden="true">
        ✨
      </span>
      <span>{t(phoneApp() ? 'updateAvailable' : 'updateReady', { v: state.version })}</span>
      <Button size="sm" variant="ghost" onClick={() => setHidden(state.version)}>
        {t('later')}
      </Button>
      <Button size="sm" variant="primary" onClick={() => platform.installUpdate()}>
        {t(phoneApp() ? 'updateNow' : 'restartUpdate')}
      </Button>
    </div>
  );
}

export function UpdateSettings() {
  const { t } = useBloom();
  const state = useUpdateState();
  const [version, setVersion] = useState('');
  useEffect(() => {
    platform.appVersion().then(setVersion);
  }, []);
  if (state.status === 'unsupported' && platform.kind !== 'desktop') return null;

  const line =
    state.status === 'checking'
      ? t('updateChecking')
      : state.status === 'up-to-date'
        ? t('updateLatest')
        : state.status === 'downloading'
          ? t('updateDownloading', { v: state.version, p: state.percent })
          : state.status === 'ready'
            ? t(phoneApp() ? 'updateAvailable' : 'updateReady', { v: state.version })
            : state.status === 'error'
              ? t('updateError')
              : state.status === 'unsupported'
                ? t('updateDev')
                : '';

  return (
    <div className="field">
      <span className="field-label">{t('updates')}</span>
      <div className="update-row">
        <span>
          Bloom {version}
          {line && <span className="muted"> · {line}</span>}
        </span>
        {state.status === 'ready' ? (
          <Button size="sm" variant="primary" onClick={() => platform.installUpdate()}>
            {t(phoneApp() ? 'updateNow' : 'restartUpdate')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => platform.checkForUpdates()} disabled={state.status === 'checking' || state.status === 'downloading' || state.status === 'unsupported'}>
            {t('checkUpdates')}
          </Button>
        )}
      </div>
    </div>
  );
}
