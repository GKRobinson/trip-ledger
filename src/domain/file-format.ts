import { isIsoDate, tripLength, type IsoDate } from './dates';
import { ID_RE } from './ids';
import { isCents, type Cents } from './money';
import { LIMITS } from './trip-ops';
import {
  METHODS,
  type AppSettings,
  type Amount,
  type BudgetChange,
  type DayEntry,
  type ForeignCurrency,
  type Method,
  type Pool,
  type Rate,
  type Trip,
  type TripRecord,
  type Version,
  type VersionKind,
} from './types';

/**
 * Every file the app reads or writes is JSON with a `format` and a
 * `schemaVersion`. Anything read back — a shared trip file or the app's own
 * stored data — goes through the same strict reader, so a damaged or
 * hand-edited file is refused with a reason instead of half-loading.
 *
 * Changing the shape of Trip means bumping SCHEMA_VERSION and teaching
 * `readTrip` to upgrade the older shape.
 */
export const SCHEMA_VERSION = 1;
export const TRIP_FILE_FORMAT = 'trip-ledger/trip';
export const RECORD_FORMAT = 'trip-ledger/record';
export const SETTINGS_FORMAT = 'trip-ledger/settings';
/** Generous: a long trip with many receipts is well under 1 MB. */
export const MAX_FILE_CHARS = 5_000_000;

/** What a shared trip file contains. */
export interface TripFile {
  exportedAt: number;
  /** Sender's name; '' when they hadn't set one. */
  exportedBy: string;
  trip: Trip;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

class Invalid extends Error {}

function fail(path: string, problem: string): never {
  throw new Invalid(`${path} ${problem}`);
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'is missing or not an object');
  return v as Record<string, unknown>;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'is missing or not a list');
  return v;
}

function str(v: unknown, path: string, max: number, required = false): string {
  if (typeof v !== 'string') fail(path, 'is missing or not text');
  if (v.length > max) fail(path, `is longer than ${max} characters`);
  if (required && !v.trim()) fail(path, 'is empty');
  return v;
}

function id(v: unknown, path: string): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) fail(path, 'is not a valid id');
  return v;
}

function date(v: unknown, path: string): IsoDate {
  if (!isIsoDate(v)) fail(path, 'is not a valid date');
  return v;
}

function cents(v: unknown, path: string): Cents {
  if (!isCents(v)) fail(path, 'is not a valid amount');
  return v;
}

function timestamp(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) fail(path, 'is not a valid time');
  return v;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (!options.includes(v as T)) fail(path, 'has an unknown value');
  return v as T;
}

function readRate(v: unknown, path: string): Rate {
  const o = obj(v, path);
  const paid = cents(o.paid, `${path}.paid`);
  const got = cents(o.got, `${path}.got`);
  if (paid <= 0) fail(`${path}.paid`, 'is not above zero');
  if (got <= 0) fail(`${path}.got`, 'is not above zero');
  return {
    id: id(o.id, `${path}.id`),
    date: date(o.date, `${path}.date`),
    paid,
    got,
    note: str(o.note, `${path}.note`, LIMITS.noteLength),
  };
}

function readPool(v: unknown, path: string): Pool {
  const o = obj(v, path);
  let foreign: ForeignCurrency | null = null;
  if (o.foreign !== null) {
    const f = obj(o.foreign, `${path}.foreign`);
    const rates = arr(f.rates, `${path}.foreign.rates`).map((r, i) => readRate(r, `${path}.foreign.rates[${i}]`));
    if (rates.length === 0) fail(`${path}.foreign.rates`, 'is empty');
    if (new Set(rates.map((r) => r.id)).size !== rates.length) fail(`${path}.foreign.rates`, 'has a repeated id');
    rates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    foreign = { currency: str(f.currency, `${path}.foreign.currency`, LIMITS.currencyLength, true), rates };
  }
  return { id: id(o.id, `${path}.id`), name: str(o.name, `${path}.name`, LIMITS.poolNameLength, true), foreign };
}

function readAmount(v: unknown, path: string): Amount {
  const o = obj(v, path);
  return { cents: cents(o.cents, `${path}.cents`), note: str(o.note, `${path}.note`, LIMITS.noteLength) };
}

function readEntry(v: unknown, path: string, poolIds: Set<string>): DayEntry {
  const o = obj(v, path);
  const amountsIn = obj(o.amounts, `${path}.amounts`);
  const amounts: Record<string, Amount[]> = {};
  for (const [poolId, list] of Object.entries(amountsIn)) {
    if (!poolIds.has(poolId)) fail(`${path}.amounts`, `refers to a pool that isn't in the trip`);
    const items = arr(list, `${path}.amounts.${poolId}`);
    if (items.length > LIMITS.maxAmountsPerPool) fail(`${path}.amounts.${poolId}`, 'has too many amounts');
    if (items.length) amounts[poolId] = items.map((a, i) => readAmount(a, `${path}.amounts.${poolId}[${i}]`));
  }
  return { date: date(o.date, `${path}.date`), amounts };
}

function readBudgetChange(v: unknown, path: string): BudgetChange {
  const o = obj(v, path);
  return {
    id: id(o.id, `${path}.id`),
    date: date(o.date, `${path}.date`),
    cents: cents(o.cents, `${path}.cents`),
    note: str(o.note, `${path}.note`, LIMITS.noteLength),
  };
}

export function readTrip(v: unknown, path = 'trip'): Trip {
  const o = obj(v, path);
  const startDate = date(o.startDate, `${path}.startDate`);
  const endDate = date(o.endDate, `${path}.endDate`);
  if (endDate < startDate) fail(`${path}.endDate`, 'is before the start date');
  if (tripLength(startDate, endDate) > LIMITS.maxTripDays) fail(path, 'is longer than the app allows');

  const pools = arr(o.pools, `${path}.pools`).map((p, i) => readPool(p, `${path}.pools[${i}]`));
  if (pools.length === 0 || pools.length > LIMITS.maxPools) fail(`${path}.pools`, 'has the wrong number of pools');
  const poolIds = new Set(pools.map((p) => p.id));
  if (poolIds.size !== pools.length) fail(`${path}.pools`, 'has a repeated id');

  const inTrip = (d: IsoDate, p: string) => {
    if (d < startDate || d > endDate) fail(p, 'is outside the trip dates');
  };

  const entries = arr(o.entries, `${path}.entries`).map((e, i) => readEntry(e, `${path}.entries[${i}]`, poolIds));
  entries.forEach((e, i) => inTrip(e.date, `${path}.entries[${i}].date`));
  if (new Set(entries.map((e) => e.date)).size !== entries.length) fail(`${path}.entries`, 'has two entries on one date');
  entries.sort((a, b) => (a.date < b.date ? -1 : 1));

  const budgetChanges = arr(o.budgetChanges, `${path}.budgetChanges`).map((c, i) =>
    readBudgetChange(c, `${path}.budgetChanges[${i}]`),
  );
  budgetChanges.forEach((c, i) => inTrip(c.date, `${path}.budgetChanges[${i}].date`));
  if (new Set(budgetChanges.map((c) => c.id)).size !== budgetChanges.length) {
    fail(`${path}.budgetChanges`, 'has a repeated id');
  }
  budgetChanges.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const startingBudget = cents(o.startingBudget, `${path}.startingBudget`);
  if (startingBudget <= 0) fail(`${path}.startingBudget`, 'is not above zero');

  return {
    id: id(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`, LIMITS.nameLength, true),
    currency: str(o.currency, `${path}.currency`, LIMITS.currencyLength, true),
    startDate,
    endDate,
    method: oneOf<Method>(o.method, METHODS, `${path}.method`),
    startingBudget,
    pools,
    budgetChanges,
    entries,
    editorInstallId: id(o.editorInstallId, `${path}.editorInstallId`),
    updatedAt: timestamp(o.updatedAt, `${path}.updatedAt`),
    updatedBy: str(o.updatedBy, `${path}.updatedBy`, LIMITS.userNameLength),
  };
}

/** Checks the envelope every file shares, and hands back its contents. */
function envelope(text: string, format: string, what: string): Record<string, unknown> {
  if (text.length > MAX_FILE_CHARS) throw new Invalid(`This ${what} is too large to be a Trip Ledger file.`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Invalid(`This isn’t a Trip Ledger ${what} (it isn’t valid JSON).`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Invalid(`This isn’t a Trip Ledger ${what}.`);
  const o = data as Record<string, unknown>;
  if (o.format !== format) {
    if ('budget' in o && 'entries' in o) {
      throw new Invalid('This is a backup from the old Trip Ledger web app, which this version can’t import.');
    }
    throw new Invalid(`This isn’t a Trip Ledger ${what}.`);
  }
  if (typeof o.schemaVersion === 'number' && o.schemaVersion > SCHEMA_VERSION) {
    throw new Invalid('This file was made by a newer version of Trip Ledger. Update the app to open it.');
  }
  if (o.schemaVersion !== SCHEMA_VERSION) throw new Invalid(`This ${what} has an unknown version.`);
  return o;
}

function attempt<T>(read: () => T, damaged: string): Result<T> {
  try {
    return { ok: true, value: read() };
  } catch (e) {
    if (!(e instanceof Invalid)) throw e;
    // Envelope errors are already full sentences; field errors get context.
    const msg = e.message;
    return { ok: false, error: /^[A-Z]/.test(msg) ? msg : `${damaged} (${msg}).` };
  }
}

export function serializeTripFile(trip: Trip, exportedBy: string, now: number): string {
  const file = { format: TRIP_FILE_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now, exportedBy, trip };
  return JSON.stringify(file, null, 2);
}

export function parseTripFile(text: string): Result<TripFile> {
  return attempt(() => {
    const o = envelope(text, TRIP_FILE_FORMAT, 'trip file');
    return {
      exportedAt: timestamp(o.exportedAt, 'exportedAt'),
      exportedBy: str(o.exportedBy, 'exportedBy', LIMITS.userNameLength),
      trip: readTrip(o.trip),
    };
  }, 'This trip file is damaged or incomplete');
}

const VERSION_KINDS: readonly VersionKind[] = [
  'created',
  'exported',
  'imported',
  'beforeImport',
  'beforeSwitch',
  'beforeDelete',
  'beforeEdit',
  'beforeSettings',
];

export function serializeRecord(record: TripRecord): string {
  return JSON.stringify({ format: RECORD_FORMAT, schemaVersion: SCHEMA_VERSION, ...record });
}

export function parseRecord(text: string): Result<TripRecord> {
  return attempt(() => {
    const o = envelope(text, RECORD_FORMAT, 'saved trip');
    const trip = readTrip(o.trip);
    const versions = arr(o.versions, 'versions').map((v, i): Version => {
      const vo = obj(v, `versions[${i}]`);
      const vt = readTrip(vo.trip, `versions[${i}].trip`);
      if (vt.id !== trip.id) fail(`versions[${i}].trip.id`, 'belongs to a different trip');
      return {
        id: id(vo.id, `versions[${i}].id`),
        kind: oneOf(vo.kind, VERSION_KINDS, `versions[${i}].kind`),
        at: timestamp(vo.at, `versions[${i}].at`),
        detail: str(vo.detail, `versions[${i}].detail`, 200),
        trip: vt,
      };
    });
    const currentVersionId = o.currentVersionId === null ? null : id(o.currentVersionId, 'currentVersionId');
    return { trip, versions, currentVersionId };
  }, 'This saved trip is damaged');
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify({ format: SETTINGS_FORMAT, schemaVersion: SCHEMA_VERSION, ...settings });
}

export function parseSettings(text: string): Result<AppSettings> {
  return attempt(() => {
    const o = envelope(text, SETTINGS_FORMAT, 'settings file');
    return {
      installId: id(o.installId, 'installId'),
      userName: str(o.userName, 'userName', LIMITS.userNameLength),
    };
  }, 'The settings file is damaged');
}

/** "Japan 2026 2026-11-12.tripledger.json" — safe on Windows, Linux and Android. */
export function exportFileName(trip: Trip, today: IsoDate): string {
  const base = trip.name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)
    .replace(/[. ]+$/, '');
  return `${base || 'Trip'} ${today}.tripledger.json`;
}
