import { useEffect, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import type { AutoBackupState } from '../shared/backup';
import type { FontSize, GameModeSetting, HolidaySet, ThemeMode } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Segmented, Toggle } from './common';
import { RemindersPicker, SoundSelect } from './editors';
import { playSound } from './sound';
import { useAlive, useBloom } from './store';
import { UpdateSettings } from './Updates';
import { AccountSettings } from './Account';
import { HealthSettings } from './Health';

export type SettingsTab = 'account' | 'general' | 'calendar' | 'reminders' | 'health' | 'backup';
type Tab = SettingsTab;

export function SettingsPanel({ onClose, initialTab }: { onClose: () => void; initialTab?: SettingsTab }) {
  const { t, settings, setSettings, toast, del } = useBloom();
  const sounds = useAlive('sounds');
  const [tab, setTab] = useState<Tab>(initialTab ?? 'general');
  const [game, setGame] = useState<{ available: boolean; gamingNow: boolean } | null>(null);

  useEffect(() => {
    if (tab !== 'reminders') return;
    let alive = true;
    const poll = () => platform.gameStatus().then((g) => alive && setGame(g));
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tab, settings.gameMode]);

  const tabs: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { id: 'account', label: t('account'), icon: 'people' },
    { id: 'general', label: t('general'), icon: 'settings' },
    { id: 'calendar', label: t('calendar'), icon: 'calendar' },
    { id: 'reminders', label: t('notifications'), icon: 'bell' },
    { id: 'health', label: t('health'), icon: 'heartPulse' },
    { id: 'backup', label: t('backup'), icon: 'note' },
  ];

  return (
    <Modal title={t('settings')} onClose={onClose} width={760} className="settings-modal">
      <div className="settings">
        <div className="settings-tabs" role="tablist">
          {tabs.map((x) => (
            <button type="button" role="tab" aria-selected={tab === x.id} key={x.id} className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>
              <Icon name={x.icon} size={16} />
              {x.label}
            </button>
          ))}
        </div>
        <div className="settings-body">
          {tab === 'account' && <AccountSettings />}
          {tab === 'general' && (
            <>
              <Field label={t('language')}>
                <Segmented
                  value={settings.language}
                  onChange={(language) => setSettings({ language })}
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'he', label: 'עברית' },
                  ]}
                />
              </Field>
              <Field label={t('theme')}>
                <Segmented<ThemeMode>
                  value={settings.theme}
                  onChange={(theme) => setSettings({ theme })}
                  options={(['system', 'light', 'dark'] as ThemeMode[]).map((v) => ({ value: v, label: t(`theme_${v}` as StringKey) }))}
                />
              </Field>
              <Field label={t('textSize')}>
                <Segmented<FontSize>
                  value={settings.fontSize ?? 'medium'}
                  onChange={(fontSize) => setSettings({ fontSize })}
                  options={(['small', 'medium', 'large'] as FontSize[]).map((v) => ({ value: v, label: t(`textSize_${v}` as StringKey) }))}
                />
              </Field>
              <Field label={t('currency')}>
                <Segmented
                  value={settings.currency}
                  onChange={(currency) => setSettings({ currency })}
                  options={[
                    { value: 'ILS', label: '₪ ILS' },
                    { value: 'USD', label: '$ USD' },
                    { value: 'EUR', label: '€ EUR' },
                    { value: 'GBP', label: '£ GBP' },
                  ]}
                />
              </Field>
              <Field label={t('weekStart')}>
                <Segmented<0 | 1>
                  value={settings.weekStart}
                  onChange={(weekStart) => setSettings({ weekStart })}
                  options={[
                    { value: 0, label: t('sunday') },
                    { value: 1, label: t('monday') },
                  ]}
                />
              </Field>
              {platform.kind === 'desktop' && (
                <>
              <Toggle checked={settings.startWithWindows} label={t('startWithWindows')} onChange={(startWithWindows) => setSettings({ startWithWindows })} />
              <Toggle checked={settings.closeToTray} label={t('closeToTray')} onChange={(closeToTray) => setSettings({ closeToTray })} />
              <Toggle checked={settings.startupGlance ?? true} label={t('startupGlance')} onChange={(startupGlance) => setSettings({ startupGlance })} />
                            </>
              )}
              <UpdateSettings />
            </>
          )}

          {tab === 'calendar' && (
            <>
              <Field label={t('holidays')}>
                <Segmented<HolidaySet>
                  value={settings.holidays}
                  onChange={(holidays) => setSettings({ holidays })}
                  options={(['none', 'jewish', 'christian', 'both'] as HolidaySet[]).map((v) => ({ value: v, label: t(`holidays_${v}` as StringKey) }))}
                />
              </Field>
              {(settings.holidays === 'jewish' || settings.holidays === 'both') && (
                <Toggle checked={settings.holidaysIsrael} label={t('israelSchedule')} onChange={(holidaysIsrael) => setSettings({ holidaysIsrael })} />
              )}
              <Toggle checked={settings.showHebrewDate} label={t('showHebrewDate')} onChange={(showHebrewDate) => setSettings({ showHebrewDate })} />
            </>
          )}

          {tab === 'reminders' && platform.kind === 'android' && (
            <>
              {/* Phone: reminders are Android notifications (sound = the phone's notification sound). */}
              <Field label={t('defaultReminder')}>
                <RemindersPicker value={settings.defaultRemindBefore} onChange={(defaultRemindBefore) => setSettings({ defaultRemindBefore })} />
              </Field>
              <div className="row">
                <Button icon="bell" variant="ghost" onClick={() => platform.testPopup()}>
                  {t('testReminder')}
                </Button>
              </div>
            </>
          )}

          {tab === 'reminders' && platform.kind !== 'android' && (
            <>
              <Field label={t('defaultSound')}>
                <SoundSelect value={settings.defaultSound} onChange={(defaultSound) => setSettings({ defaultSound })} />
              </Field>
              <Field label={`${t('volume')} — ${Math.round(settings.volume * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.volume}
                  onChange={(e) => setSettings({ volume: Number(e.target.value) })}
                  onMouseUp={() => playSound(settings.defaultSound, settings.volume)}
                />
              </Field>
              <Field label={t('defaultReminder')}>
                <RemindersPicker value={settings.defaultRemindBefore} onChange={(defaultRemindBefore) => setSettings({ defaultRemindBefore })} />
              </Field>
              <div className="field">
                <span className="field-label">{t('yourSounds')}</span>
                {sounds.length === 0 && <p className="muted small">{t('noCustomSounds')}</p>}
                <ul className="sound-list">
                  {sounds.map((s) => (
                    <li key={s.id}>
                      <IconButton icon="play" label={t('play')} onClick={() => playSound(s.id, settings.volume)} />
                      <span>{s.name}</span>
                      <IconButton icon="trash" label={t('delete')} onClick={() => del('sounds', s)} />
                    </li>
                  ))}
                </ul>
                <div className="row">
                  <Button
                    icon="plus"
                    onClick={async () => {
                      const s = await platform.importSound();
                      if (s) playSound(s.id, settings.volume);
                    }}
                  >
                    {t('addSound')}
                  </Button>
                  <Button icon="bell" variant="ghost" onClick={() => platform.testPopup()}>
                    {t('testReminder')}
                  </Button>
                </div>
              </div>
            </>
          )}

          {tab === 'reminders' && platform.kind !== 'android' && (
            <>
              <h4 className="settings-h">{t('gameMode')}</h4>
              <div className="game-intro">
                <Icon name="gamepad" size={22} />
                <p>{t('gameModeIntro')}</p>
              </div>
              <div className="radio-list" role="radiogroup">
                {(['auto', 'always', 'off'] as GameModeSetting[]).map((m) => (
                  <label key={m} className={`radio-card ${settings.gameMode === m ? 'active' : ''}`}>
                    <input type="radio" name="gm" checked={settings.gameMode === m} onChange={() => setSettings({ gameMode: m })} />
                    {t(`gameMode_${m}` as StringKey)}
                  </label>
                ))}
              </div>
              <Toggle checked={settings.gameModeSoftSound} label={t('gameModeSoftSound')} onChange={(gameModeSoftSound) => setSettings({ gameModeSoftSound })} />
              <p className="muted small status-line">
                {game === null ? '…' : !game.available && settings.gameMode === 'auto' ? t('gameUnavailable') : game.gamingNow ? t('gameDetected') : t('gameNotDetected')}
              </p>
            </>
          )}


          {tab === 'health' && <HealthSettings />}

          {tab === 'backup' && (
            <>
              {platform.autoBackup && <AutoBackupSettings />}
              <div className="ab">
                {platform.autoBackup && <h4 className="settings-h">{t('abManual')}</h4>}
                <p className="muted">{t('backupIntro')}</p>
                <div className="row">
                  <Button icon="note" onClick={async () => (await platform.exportBackup()) && toast(t('backupSaved'))}>
                    {t('exportBackup')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const r = await platform.importBackup();
                      if (r === 'merged') toast(t('backupMerged'));
                      if (r === 'invalid') toast(t('backupInvalid'));
                    }}
                  >
                    {t('importBackup')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Weekly copy of everything to a folder the person chose (desktop only). */
function AutoBackupSettings() {
  const { t, locale, toast } = useBloom();
  const ab = platform.autoBackup!;
  const [st, setSt] = useState<AutoBackupState | null>(null);
  useEffect(() => {
    void ab.get().then(setSt);
    return ab.onChange(setSt);
  }, [ab]);
  if (!st) return null;
  const last = st.last
    ? t('abLast', { d: new Date(st.last).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) })
    : t('abNever');
  return (
    <div className="ab">
      <h4 className="settings-h">{t('abTitle')}</h4>
      <p className="muted">{t(platform.kind === 'android' ? 'abPhoneIntro' : 'abIntro')}</p>
      {st.folder ? (
        <>
          <div className="ab-folder">
            <Icon name="note" size={16} />
            <span dir="ltr">{st.folder}</span>
          </div>
          <p className={`small ab-status ${st.error ? 'err' : ''}`}>
            {st.error ? (st.error === 'folder-missing' ? t('abErrMissing') : t('abErrWrite')) + ' · ' : ''}
            {last}
          </p>
          <div className="row">
            <Button
              icon="note"
              onClick={async () => {
                const s = await ab.run();
                setSt(s);
                if (!s.error) toast(t('abSaved'));
              }}
            >
              {t('abNow')}
            </Button>
            {platform.kind !== 'android' && (
              <Button variant="ghost" onClick={async () => setSt(await ab.choose())}>
                {t('abChange')}
              </Button>
            )}
            <Button variant="ghost" onClick={async () => setSt(await ab.off())}>
              {t('abOff')}
            </Button>
          </div>
        </>
      ) : (
        <div className="row">
          <Button variant="primary" icon="plus" onClick={async () => setSt(await ab.choose())}>
            {t(platform.kind === 'android' ? 'abPhoneOn' : 'abChoose')}
          </Button>
        </div>
      )}
    </div>
  );
}
