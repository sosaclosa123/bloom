// Health tab: private health tracking (optional IBD / Crohn's part).
// Everything here is always private (see db.ts `asPrivateHealth`) and only
// shows on a computer where Health is turned on in Settings.
import { Button, Icon, Toggle } from './common';
import { useBloom } from './store';

// ---------------------------------------------------------------- settings (per device)

export function HealthSettings() {
  const { t, settings, setSettings } = useBloom();
  return (
    <>
      <div className="hl-set-intro">
        <Icon name="lock" size={16} />
        <p>{t('hlEnableHint')}</p>
      </div>
      <Toggle checked={settings.healthEnabled} label={t('hlEnable')} onChange={(healthEnabled) => setSettings({ healthEnabled })} />
      {settings.healthEnabled && (
        <div className="hl-set-sub">
          <Toggle checked={settings.healthIbd} label={t('hlIbd')} onChange={(healthIbd) => setSettings({ healthIbd })} />
          <p className="muted small">{t('hlIbdHint')}</p>
        </div>
      )}
      <p className="muted small">{t('hlDeviceOnly')}</p>
    </>
  );
}

// ---------------------------------------------------------------- page

export function HealthPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t, settings } = useBloom();
  if (!settings.healthEnabled) {
    return (
      <div className="page">
        <div className="page-empty hl-off">
          <div className="hl-off-icon" aria-hidden="true">
            <Icon name="heartPulse" size={40} />
          </div>
          <p className="hl-off-title">{t('hlOffTitle')}</p>
          <p>{t('hlOffBody')}</p>
          <Button variant="primary" icon="settings" onClick={onOpenSettings}>
            {t('hlOpenSettings')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="page hl">
      <div className="hl-body">
        <p className="hl-note">
          <Icon name="heartPulse" size={14} /> {t('hlNotAdvice')}
        </p>
      </div>
    </div>
  );
}
