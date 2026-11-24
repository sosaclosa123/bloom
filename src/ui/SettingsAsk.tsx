// "Change it on all your devices?" (owner, Nov 2026): asked before an account
// setting changes while signed in. "Only this device" keeps it local
// (settings.localKeys; the sync engine skips it both ways).
import { useState } from 'react';
import { Button, Modal } from './common';
import { useBloom } from './store';

export function SettingsAskModal() {
  const { t, settingsAsk, answerSettingsAsk } = useBloom();
  const [remember, setRemember] = useState(false);
  if (!settingsAsk) return null;
  const answer = (c: 'all' | 'local' | 'cancel') => {
    answerSettingsAsk(c, remember);
    setRemember(false);
  };
  return (
    <Modal
      title={t('setAskTitle')}
      onClose={() => answer('cancel')}
      width={420}
      className="set-ask"
      footer={
        <>
          <Button variant="ghost" onClick={() => answer('local')}>
            {t('setAskLocal')}
          </Button>
          <span className="spacer" />
          <Button variant="primary" onClick={() => answer('all')}>
            {t('setAskAll')}
          </Button>
        </>
      }
    >
      <p className="muted">{t('setAskBody')}</p>
      <label className="set-ask-remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {t('setAskRemember')}
      </label>
    </Modal>
  );
}
