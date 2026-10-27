import { useEffect, useRef, useState } from 'react';
import { formatDate, todayIso } from '../domain/dates';
import { MAX_FILE_CHARS, exportFileName, parseTripFile, serializeTripFile } from '../domain/file-format';
import { newId } from '../domain/ids';
import { applyImport, previewImport, type ImportPreview } from '../domain/import';
import { sampleTrips } from '../domain/samples';
import {
  addBudgetChange,
  addRate,
  createTrip,
  putEntry,
  removeBudgetChange,
  removeEntry,
  removeRate,
  takeOverEditing,
  updateSettings,
  type TripSettingsInput,
} from '../domain/trip-ops';
import type { AppSettings, EditMeta, Trip, TripRecord, VersionKind } from '../domain/types';
import { addVersion, applyEdit, newRecord, removeVersion, switchToVersion } from '../domain/versions';
import type { Platform } from '../platform/platform';
import type { Repository, UnreadableTrip } from '../storage/repository';
import { ImportView } from './ImportView';
import { SettingsView } from './SettingsView';
import { TripForm } from './TripForm';
import { TripList } from './TripList';
import { TripView, type TripActions } from './TripView';
import { VersionsView } from './VersionsView';
import { signedMoney } from './format';

type Screen =
  | { name: 'home' }
  | { name: 'newTrip' }
  | { name: 'trip'; id: string }
  | { name: 'editTrip'; id: string }
  | { name: 'versions'; id: string }
  | { name: 'import'; preview: ImportPreview }
  | { name: 'settings' };

function parentOf(screen: Screen): Screen | null {
  switch (screen.name) {
    case 'home':
      return null;
    case 'editTrip':
    case 'versions':
      return { name: 'trip', id: screen.id };
    default:
      return { name: 'home' };
  }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function App({
  platform,
  repo,
  initialSettings,
  initialRecords,
  unreadable,
  notice,
}: {
  platform: Platform;
  repo: Repository;
  initialSettings: AppSettings;
  initialRecords: TripRecord[];
  unreadable: UnreadableTrip[];
  notice: string | null;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [records, setRecords] = useState<Record<string, TripRecord>>(() =>
    Object.fromEntries(initialRecords.map((r) => [r.trip.id, r])),
  );
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const today = todayIso();

  const show = (text: string, bad = false) => setToast({ text, bad });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.bad ? 7000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name]);

  // Android Back: one screen up, and out of the app from the trip list.
  useEffect(() => {
    platform.onBackButton?.(() => {
      const parent = parentOf(screenRef.current);
      if (parent) setScreen(parent);
      else platform.exitApp?.();
    });
  }, [platform]);

  const meta = (): EditMeta => ({ now: Date.now(), userName: settings.userName });

  // Every change runs through `serial`, one at a time, starting from the
  // latest saved state in `saved`. Two quick taps can't both start from the
  // same old copy and silently drop one of the changes.
  const saved = useRef(records);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  function serial<T>(op: () => Promise<T>): Promise<T> {
    const run = queue.current.then(op, op);
    queue.current = run.catch(() => undefined);
    return run;
  }

  /** Writes to storage first; the screen only changes once the save worked. */
  async function persist(record: TripRecord): Promise<boolean> {
    try {
      await repo.saveTrip(record);
      saved.current = { ...saved.current, [record.trip.id]: record };
      setRecords(saved.current);
      return true;
    } catch (e) {
      show(`Couldn’t save: ${errorText(e)}`, true);
      return false;
    }
  }

  /** Applies `change` to the latest saved record of trip `id` and saves it. */
  function update(id: string, change: (record: TripRecord) => TripRecord): Promise<boolean> {
    return serial(async () => {
      const record = saved.current[id];
      return record ? persist(change(record)) : false;
    });
  }

  /** An edit to a trip, optionally saving the state before it as a version. */
  function edit(id: string, change: (trip: Trip, m: EditMeta) => Trip, before?: { kind: VersionKind; detail: string }) {
    return update(id, (record) => {
      const m = meta();
      return applyEdit(record, change(record.trip, m), before ? { ...before, now: m.now, versionId: newId() } : null);
    });
  }

  function createTripFrom(input: TripSettingsInput) {
    return serial(async () => {
      const m = meta();
      const trip = createTrip(input, newId(), settings.installId, m);
      if (await persist(newRecord(trip, 'created', '', m.now, newId()))) setScreen({ name: 'trip', id: trip.id });
    });
  }

  function exportTrip(id: string) {
    return serial(async () => {
      const record = saved.current[id];
      if (!record) return;
      const now = Date.now();
      const fileName = exportFileName(record.trip, todayIso());
      try {
        const outcome = await platform.exportFile(fileName, serializeTripFile(record.trip, settings.userName, now));
        if (outcome === 'cancelled') return;
        if (await persist(addVersion(record, 'exported', fileName, now, newId()))) show('Exported ✓');
      } catch (e) {
        show(`Couldn’t export: ${errorText(e)}`, true);
      }
    });
  }

  async function readImportFile(file: File) {
    if (file.size > MAX_FILE_CHARS * 4) {
      show('That file is too large to be a Trip Ledger file.', true);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      show(`Couldn’t read that file: ${errorText(e)}`, true);
      return;
    }
    const parsed = parseTripFile(text);
    if (!parsed.ok) {
      show(parsed.error, true);
      return;
    }
    const existing = saved.current[parsed.value.trip.id]?.trip ?? null;
    setScreen({ name: 'import', preview: previewImport(existing, parsed.value, settings.installId) });
  }

  function confirmImport(preview: ImportPreview) {
    return serial(async () => {
      const id = preview.file.trip.id;
      const record = applyImport(saved.current[id] ?? null, preview.file, Date.now(), newId);
      if (await persist(record)) {
        setScreen({ name: 'trip', id });
        show(preview.existing ? 'Trip replaced ✓' : 'Trip added ✓');
      }
    });
  }

  function deleteTrip(id: string) {
    return serial(async () => {
      try {
        await repo.deleteTrip(id);
      } catch (e) {
        show(`Couldn’t delete: ${errorText(e)}`, true);
        return;
      }
      const { [id]: _gone, ...rest } = saved.current;
      saved.current = rest;
      setRecords(rest);
      setScreen({ name: 'home' });
      show('Trip deleted');
    });
  }

  async function saveName(userName: string) {
    const next = { ...settings, userName };
    try {
      await repo.saveSettings(next);
      setSettings(next);
      return true;
    } catch (e) {
      show(`Couldn’t save: ${errorText(e)}`, true);
      return false;
    }
  }

  function addSamples() {
    return serial(async () => {
      const m = meta();
      for (const trip of sampleTrips(today, settings.installId, m, newId)) {
        if (!(await persist(newRecord(trip, 'created', '', m.now, newId())))) return;
      }
      setScreen({ name: 'home' });
      show('Sample trips added ✓');
    });
  }

  function tripActions(id: string): TripActions {
    return {
      saveEntry: (entry, existed) =>
        edit(id, (t, m) => putEntry(t, entry, m), existed ? { kind: 'beforeEdit', detail: formatDate(entry.date) } : undefined),
      deleteEntry: (date) => void edit(id, (t, m) => removeEntry(t, date, m), { kind: 'beforeDelete', detail: formatDate(date) }),
      addBudgetChange: (change) => edit(id, (t, m) => addBudgetChange(t, change, m)),
      deleteBudgetChange: (change) =>
        void edit(id, (t, m) => removeBudgetChange(t, change.id, m), {
          kind: 'beforeDelete',
          detail: `the ${signedMoney(change.cents)} budget change`,
        }),
      addRate: (poolId, rate) => edit(id, (t, m) => addRate(t, poolId, rate, m)),
      deleteRate: (pool, rate) =>
        void edit(id, (t, m) => removeRate(t, pool.id, rate.id, m), {
          kind: 'beforeDelete',
          detail: `the ${pool.name} rate from ${formatDate(rate.date)}`,
        }),
      exportTrip: () => void exportTrip(id),
      startEditing: () =>
        void edit(id, (t, m) => takeOverEditing(t, settings.installId, m)).then((ok) => ok && show('You’re now the editor')),
      openVersions: () => setScreen({ name: 'versions', id }),
      openSettings: () => setScreen({ name: 'editTrip', id }),
    };
  }

  let view: React.ReactNode;
  const goHome = () => setScreen({ name: 'home' });
  switch (screen.name) {
    case 'home':
      view = (
        <TripList
          records={Object.values(records)}
          installId={settings.installId}
          today={today}
          unreadable={unreadable}
          notice={notice}
          onOpen={(id) => setScreen({ name: 'trip', id })}
          onNew={() => setScreen({ name: 'newTrip' })}
          onImport={() => fileInput.current?.click()}
          onSettings={() => setScreen({ name: 'settings' })}
        />
      );
      break;
    case 'newTrip':
      view = <TripForm existing={null} today={today} onSave={createTripFrom} onCancel={goHome} />;
      break;
    case 'trip': {
      const record = records[screen.id];
      view = record ? (
        <TripView key={screen.id} record={record} installId={settings.installId} today={today} onBack={goHome} actions={tripActions(screen.id)} />
      ) : null;
      break;
    }
    case 'editTrip': {
      const record = records[screen.id];
      const id = screen.id;
      view = record ? (
        <TripForm
          existing={record.trip}
          today={today}
          onCancel={() => setScreen({ name: 'trip', id })}
          onSave={async (input) => {
            if (await edit(id, (t, m) => updateSettings(t, input, m), { kind: 'beforeSettings', detail: '' })) {
              setScreen({ name: 'trip', id });
              show('Settings saved ✓');
            }
          }}
          onDelete={() => void deleteTrip(id)}
        />
      ) : null;
      break;
    }
    case 'versions': {
      const record = records[screen.id];
      view = record ? (
        <VersionsView
          record={record}
          onBack={() => setScreen({ name: 'trip', id: screen.id })}
          onSwitch={async (versionId) => {
            const ok = await update(screen.id, (r) => switchToVersion(r, versionId, settings.installId, meta(), newId()));
            if (ok) show('Switched ✓');
          }}
          onDelete={(versionId) => void update(screen.id, (r) => removeVersion(r, versionId))}
        />
      ) : null;
      break;
    }
    case 'import':
      view = <ImportView preview={screen.preview} onConfirm={() => void confirmImport(screen.preview)} onCancel={goHome} />;
      break;
    case 'settings':
      view = (
        <SettingsView settings={settings} platform={platform} onBack={goHome} onSaveName={saveName} onAddSamples={() => void addSamples()} />
      );
      break;
  }

  return (
    <>
      {view ?? (
        <main className="shell">
          <p>That trip isn’t here any more.</p>
          <button className="btn" onClick={goHome}>
            Back to trips
          </button>
        </main>
      )}
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void readImportFile(file);
        }}
      />
      {toast && (
        <div className={'toast' + (toast.bad ? ' bad' : '')} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </>
  );
}
