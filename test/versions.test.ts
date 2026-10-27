import { describe, expect, it } from 'vitest';
import { putEntry, removeEntry } from '../src/domain/trip-ops';
import {
  addVersion,
  applyEdit,
  isEditedSince,
  newRecord,
  removeVersion,
  sameContent,
  switchToVersion,
} from '../src/domain/versions';
import { META, ME, SAM, entry, makeTrip, testId } from './helpers';

const before = (kind: 'beforeDelete' | 'beforeEdit', now = 2_000) => ({ kind, detail: '1 Nov', now, versionId: testId() });

describe('versions', () => {
  it('starts with the created version', () => {
    const record = newRecord(makeTrip(), 'created', '', 1, 'v-created');
    expect(record.versions.map((v) => v.kind)).toEqual(['created']);
    expect(isEditedSince(record)).toBe(false);
  });

  it('saves the state before a destructive edit, unless it is already saved', () => {
    let record = newRecord(makeTrip(), 'created', '', 1, 'v-created');
    record = applyEdit(record, putEntry(record.trip, entry('2026-11-01', [100]), META), null);
    record = applyEdit(record, putEntry(record.trip, entry('2026-11-02', [200]), META), null);
    expect(isEditedSince(record)).toBe(true);

    record = applyEdit(record, removeEntry(record.trip, '2026-11-01', META), before('beforeDelete'));
    expect(record.versions.map((v) => v.kind)).toEqual(['created', 'beforeDelete']);
    expect(record.versions[1]!.trip.entries).toHaveLength(2); // the deleted day is kept there

    // Straight after an export the state is already saved, so nothing new is.
    record = addVersion(record, 'exported', '', 3_000, 'v-export');
    record = applyEdit(record, removeEntry(record.trip, '2026-11-02', META), before('beforeDelete'));
    expect(record.versions.map((v) => v.kind)).toEqual(['created', 'beforeDelete', 'exported']);
  });

  it('switches without losing unsaved changes, and back again', () => {
    let record = newRecord(makeTrip(), 'created', '', 1, 'v-created');
    record = applyEdit(record, putEntry(record.trip, entry('2026-11-01', [100]), META), null);

    record = switchToVersion(record, 'v-created', ME, META, 'v-saved');
    expect(record.trip.entries).toEqual([]);
    expect(record.versions.map((v) => v.kind)).toEqual(['created', 'beforeSwitch']);
    expect(isEditedSince(record)).toBe(false);

    record = switchToVersion(record, 'v-saved', ME, META, 'v-unused');
    expect(record.trip.entries).toHaveLength(1);
    expect(record.versions).toHaveLength(2); // nothing unsaved, so nothing new saved
  });

  it('stamps a switch as your edit only on trips you edit', () => {
    const mine = newRecord(makeTrip({ updatedAt: 5 }), 'created', '', 1, 'v1');
    expect(switchToVersion(mine, 'v1', ME, { now: 77, userName: 'Greg' }, testId()).trip.updatedAt).toBe(77);
    const theirs = newRecord(makeTrip({ updatedAt: 5, editorInstallId: SAM, updatedBy: 'Sam' }), 'imported', 'Sam', 1, 'v2');
    expect(switchToVersion(theirs, 'v2', ME, { now: 77, userName: 'Greg' }, testId()).trip).toMatchObject({
      updatedAt: 5,
      updatedBy: 'Sam',
    });
  });

  it('treats content as the same regardless of key order or edit stamps', () => {
    const a = makeTrip();
    const b = Object.fromEntries(Object.entries({ ...a, updatedAt: 999, updatedBy: 'Sam' }).reverse()) as unknown as typeof a;
    expect(sameContent(a, b)).toBe(true);
    expect(sameContent(a, { ...a, name: 'Other' })).toBe(false);
  });

  it('can delete the version you are on', () => {
    const record = removeVersion(newRecord(makeTrip(), 'created', '', 1, 'v1'), 'v1');
    expect(record.currentVersionId).toBeNull();
    expect(isEditedSince(record)).toBe(true);
  });
});
