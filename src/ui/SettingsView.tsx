import { useState } from 'react';
import { LIMITS } from '../domain/trip-ops';
import type { AppSettings } from '../domain/types';
import type { Platform } from '../platform/platform';
import { Header } from './common';
import { formatDateTime } from './format';

export function SettingsView({
  settings,
  platform,
  onBack,
  onSaveName,
  onAddSamples,
}: {
  settings: AppSettings;
  platform: Platform;
  onBack: () => void;
  onSaveName: (name: string) => Promise<boolean>;
  onAddSamples: () => void;
}) {
  const [name, setName] = useState(settings.userName);
  const [saved, setSaved] = useState(false);
  const changed = name.trim() !== settings.userName;

  return (
    <>
      <Header title="Settings" onBack={onBack} />
      <main className="shell">
        <div className="card">
          <label className="field">
            <span className="label">Your name</span>
            <input
              value={name}
              maxLength={LIMITS.userNameLength}
              placeholder="e.g. Sam"
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <p className="small">
            Optional. Stamped on trip files you export and trips you change, so others see “Imported from Sam” rather than “a
            file”.
          </p>
          <button
            className="btn"
            disabled={!changed}
            onClick={async () => {
              if (await onSaveName(name.trim())) setSaved(true);
            }}
          >
            Save name
          </button>
          {saved && <p className="ok center">Saved ✓</p>}
        </div>

        <div className="card">
          <span className="label">Your data</span>
          <p className="small">
            Trips stay on this {platform.kind === 'android' ? 'phone' : 'computer'}. Nothing is sent anywhere unless you export a
            trip file and send it yourself. Exported files are your backups too: keep copies somewhere safe, such as your NAS.
          </p>
          {platform.openDataFolder && (
            <button className="ghost wide" onClick={() => void platform.openDataFolder?.()}>
              Open data folder
            </button>
          )}
        </div>

        <div className="card">
          <span className="label">Try it out</span>
          <p className="small">Adds three sample trips, one for each way of recording spending. Delete them whenever you like.</p>
          <button className="ghost wide" onClick={onAddSamples}>
            Add sample trips
          </button>
        </div>

        <p className="small center mute">
          Trip Ledger {__APP_VERSION__} · built {formatDateTime(Date.parse(__BUILD_TIME__))} · {platform.kind}
        </p>
      </main>
    </>
  );
}
