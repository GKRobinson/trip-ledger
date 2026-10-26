import type { EditMeta, Trip, TripRecord, Version, VersionKind } from './types';

/**
 * Versions are frozen copies of a trip kept on this device. Exports and
 * imports always save one. Before anything that throws information away —
 * deleting, editing a saved day, changing settings, importing, switching —
 * the current state is saved too, unless it's already saved as the version
 * you're on. Switching versions therefore never loses anything.
 */

const AUTOMATIC: ReadonlySet<VersionKind> = new Set<VersionKind>([
  'beforeImport',
  'beforeSwitch',
  'beforeDelete',
  'beforeEdit',
  'beforeSettings',
]);

export function isAutomatic(kind: VersionKind): boolean {
  return AUTOMATIC.has(kind);
}

/** JSON with object keys sorted, so equal content gives an equal string. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

/** Same trip content, ignoring who last touched it and when. */
export function sameContent(a: Trip, b: Trip): boolean {
  const { updatedAt: _a1, updatedBy: _a2, ...restA } = a;
  const { updatedAt: _b1, updatedBy: _b2, ...restB } = b;
  return canonical(restA) === canonical(restB);
}

export function currentVersion(record: TripRecord): Version | null {
  return record.versions.find((v) => v.id === record.currentVersionId) ?? null;
}

/** True when the trip has changed since the version you're on was saved. */
export function isEditedSince(record: TripRecord): boolean {
  const version = currentVersion(record);
  return !version || !sameContent(version.trip, record.trip);
}

export function newRecord(trip: Trip, kind: 'created' | 'imported', detail: string, now: number, versionId: string): TripRecord {
  return {
    trip,
    versions: [{ id: versionId, kind, at: now, detail, trip }],
    currentVersionId: versionId,
  };
}

/** Saves the current trip as a version. Automatic kinds skip it when it's already saved. */
export function addVersion(
  record: TripRecord,
  kind: VersionKind,
  detail: string,
  now: number,
  versionId: string,
): TripRecord {
  if (isAutomatic(kind) && !isEditedSince(record)) return record;
  const version: Version = { id: versionId, kind, at: now, detail, trip: record.trip };
  return { ...record, versions: [...record.versions, version], currentVersionId: versionId };
}

/** Applies an edit, first saving the state before it when `kind` is given. */
export function applyEdit(
  record: TripRecord,
  next: Trip,
  before: { kind: VersionKind; detail: string; now: number; versionId: string } | null,
): TripRecord {
  const saved = before ? addVersion(record, before.kind, before.detail, before.now, before.versionId) : record;
  return { ...saved, trip: next };
}

/**
 * Makes `versionId` the current state. Unsaved changes are saved first. When
 * you're the version's editor, the switch counts as your edit (so a file you
 * export afterwards isn't mistaken for an older one); a read-only trip keeps
 * the sender's details untouched.
 */
export function switchToVersion(
  record: TripRecord,
  versionId: string,
  installId: string,
  meta: EditMeta,
  newVersionId: string,
): TripRecord {
  const target = record.versions.find((v) => v.id === versionId);
  if (!target) throw new Error('That version no longer exists.');
  const saved = addVersion(record, 'beforeSwitch', '', meta.now, newVersionId);
  const trip: Trip =
    target.trip.editorInstallId === installId
      ? { ...target.trip, updatedAt: meta.now, updatedBy: meta.userName }
      : target.trip;
  return { ...saved, trip, currentVersionId: versionId };
}

export function removeVersion(record: TripRecord, versionId: string): TripRecord {
  return {
    ...record,
    versions: record.versions.filter((v) => v.id !== versionId),
    currentVersionId: record.currentVersionId === versionId ? null : record.currentVersionId,
  };
}
