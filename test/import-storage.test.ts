import { describe, expect, it } from 'vitest';
import { serializeRecord, type TripFile } from '../src/domain/file-format';
import { applyImport, previewImport } from '../src/domain/import';
import { putEntry } from '../src/domain/trip-ops';
import { applyEdit, newRecord } from '../src/domain/versions';
import { MemoryStore, Repository } from '../src/storage/repository';
import { META, ME, SAM, entry, makeTrip, testId } from './helpers';

const fileOf = (trip = makeTrip(), exportedBy = 'Sam'): TripFile => ({ exportedAt: 5_000, exportedBy, trip });

describe('import preview', () => {
  it('adds a trip that is new to this device, read-only when it is someone else’s', () => {
    const preview = previewImport(null, fileOf(makeTrip({ editorInstallId: SAM, entries: [entry('2026-11-01', [1])] })), ME);
    expect(preview).toMatchObject({ existing: null, addedDays: ['2026-11-01'], editableAfter: false });
  });

  it('shows what replacing your copy would add, change and lose', () => {
    const mine = makeTrip({
      updatedAt: 9_000,
      entries: [entry('2026-11-01', [100]), entry('2026-11-02', [200]), entry('2026-11-03', [300])],
      budgetChanges: [{ id: 'c1', date: '2026-11-02', cents: 500, note: '' }],
    });
    const theirs = makeTrip({
      name: 'Shared trip',
      editorInstallId: SAM,
      updatedAt: 8_000,
      entries: [entry('2026-11-01', [100]), entry('2026-11-02', [250]), entry('2026-11-04', [400])],
    });
    const preview = previewImport(mine, fileOf(theirs), ME);
    expect(preview).toMatchObject({
      identical: false,
      fileIsOlder: true,
      addedDays: ['2026-11-04'],
      changedDays: ['2026-11-02'],
      removedDays: ['2026-11-03'],
      youStopEditing: true,
      editableAfter: false,
    });
    expect(preview.removedBudgetChanges.map((c) => c.id)).toEqual(['c1']);
    expect(preview.fieldChanges).toEqual([{ label: 'Name', from: 'Test trip', to: 'Shared trip' }]);
  });

  it('says when a file matches your copy', () => {
    expect(previewImport(makeTrip(), fileOf(makeTrip({ updatedAt: 1 })), ME).identical).toBe(true);
  });
});

describe('applying an import', () => {
  it('saves your copy as a version, then replaces it', () => {
    let record = newRecord(makeTrip(), 'created', '', 1, 'v1');
    record = applyEdit(record, putEntry(record.trip, entry('2026-11-01', [100]), META), null);
    const incoming = makeTrip({ editorInstallId: SAM, entries: [entry('2026-11-05', [700])] });

    const after = applyImport(record, fileOf(incoming), 6_000, testId);
    expect(after.trip).toEqual(incoming);
    expect(after.versions.map((v) => [v.kind, v.detail])).toEqual([
      ['created', ''],
      ['beforeImport', ''],
      ['imported', 'Sam'],
    ]);
    expect(after.versions[1]!.trip.entries[0]!.date).toBe('2026-11-01'); // your edits survive as a version
  });

  it('creates a record for a new trip', () => {
    const after = applyImport(null, fileOf(), 6_000, testId);
    expect(after.versions.map((v) => v.kind)).toEqual(['imported']);
  });
});

describe('repository', () => {
  it('creates an install id once and keeps it', async () => {
    const store = new MemoryStore();
    const first = await new Repository(store, testId).loadSettings();
    const again = await new Repository(store, testId).loadSettings();
    expect(again.settings.installId).toBe(first.settings.installId);
    expect(again.notice).toBeNull();
  });

  it('keeps an unreadable settings file aside and explains the reset', async () => {
    const store = new MemoryStore();
    await store.write('settings', '{broken');
    const loaded = await new Repository(store, testId).loadSettings();
    expect(loaded.notice).toMatch(/couldn’t be read/);
    expect(await store.read('settings-unreadable')).toBe('{broken');
  });

  it('stores trips and reports unreadable ones without touching them', async () => {
    const store = new MemoryStore();
    const repo = new Repository(store, testId);
    const record = newRecord(makeTrip(), 'created', '', 1, 'v1');
    await repo.saveTrip(record);
    await store.write('trip-damaged', '{"format":"trip-ledger/record"');
    await store.write('trip-wrong-name', serializeRecord(record));

    const { records, unreadable } = await repo.loadTrips();
    expect(records).toEqual([record]);
    expect(unreadable.map((u) => u.key).sort()).toEqual(['trip-damaged', 'trip-wrong-name']);
    expect(await store.read('trip-damaged')).toBe('{"format":"trip-ledger/record"');

    await repo.deleteTrip(record.trip.id);
    expect((await repo.loadTrips()).records).toEqual([]);
  });
});
