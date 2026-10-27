import { rateText } from './currency';
import { formatDate, type IsoDate } from './dates';
import type { TripFile } from './file-format';
import { METHOD_TITLES } from './labels';
import { formatMoney } from './money';
import type { BudgetChange, DayEntry, Pool, Trip, TripRecord } from './types';
import { addVersion, newRecord, sameContent } from './versions';

/** A trip-level setting that the import would change, ready to display. */
export interface FieldChange {
  label: string;
  from: string;
  to: string;
}

/**
 * What importing a file would do, worked out before anything changes. An
 * import of a trip you already have always replaces your copy, so this is
 * what the person sees before agreeing to that.
 */
export interface ImportPreview {
  file: TripFile;
  /** Your copy, or null when the trip is new to this device. */
  existing: Trip | null;
  identical: boolean;
  /** The file's trip was last changed before your copy was. */
  fileIsOlder: boolean;
  addedDays: IsoDate[];
  changedDays: IsoDate[];
  /** Days you have that the file doesn't: lost when you replace. */
  removedDays: IsoDate[];
  addedBudgetChanges: BudgetChange[];
  removedBudgetChanges: BudgetChange[];
  fieldChanges: FieldChange[];
  /** You edit this trip now, and the file makes someone else its editor. */
  youStopEditing: boolean;
  /** After importing, this device can edit the trip. */
  editableAfter: boolean;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function entryMap(trip: Trip): Map<IsoDate, DayEntry> {
  return new Map(trip.entries.map((e) => [e.date, e]));
}

function fieldChanges(from: Trip, to: Trip): FieldChange[] {
  const changes: FieldChange[] = [];
  const add = (label: string, a: string, b: string) => {
    if (a !== b) changes.push({ label, from: a, to: b });
  };
  add('Name', from.name, to.name);
  add('Dates', `${formatDate(from.startDate, true)} – ${formatDate(from.endDate, true)}`,
    `${formatDate(to.startDate, true)} – ${formatDate(to.endDate, true)}`);
  add('Currency', from.currency, to.currency);
  add('Starting budget', formatMoney(from.startingBudget), formatMoney(to.startingBudget));
  add('Recording method', METHOD_TITLES[from.method], METHOD_TITLES[to.method]);
  const poolLabel = (p: Pool) => (p.foreign ? `${p.name} (${p.foreign.currency})` : p.name);
  add('Pools', from.pools.map(poolLabel).join(', '), to.pools.map(poolLabel).join(', '));
  add('Exchange rates', ratesSummary(from), ratesSummary(to));
  return changes;
}

function ratesSummary(trip: Trip): string {
  return trip.pools
    .flatMap((p) =>
      p.foreign
        ? [`${p.name}: ${p.foreign.rates.map((r) => `${rateText(r, p.foreign!.currency, trip.currency)} from ${formatDate(r.date)}`).join('; ')}`]
        : [],
    )
    .join(' · ');
}

export function previewImport(existing: Trip | null, file: TripFile, installId: string): ImportPreview {
  const incoming = file.trip;
  const editableAfter = incoming.editorInstallId === installId;
  if (!existing) {
    return {
      file,
      existing: null,
      identical: false,
      fileIsOlder: false,
      addedDays: incoming.entries.map((e) => e.date),
      changedDays: [],
      removedDays: [],
      addedBudgetChanges: incoming.budgetChanges,
      removedBudgetChanges: [],
      fieldChanges: [],
      youStopEditing: false,
      editableAfter,
    };
  }
  const mine = entryMap(existing);
  const theirs = entryMap(incoming);
  const sameChange = (a: BudgetChange) => (b: BudgetChange) => a.id === b.id && sameJson(a, b);
  return {
    file,
    existing,
    identical: sameContent(existing, incoming),
    fileIsOlder: incoming.updatedAt < existing.updatedAt,
    addedDays: incoming.entries.filter((e) => !mine.has(e.date)).map((e) => e.date),
    changedDays: incoming.entries
      .filter((e) => mine.has(e.date) && !sameJson(mine.get(e.date)?.amounts, e.amounts))
      .map((e) => e.date),
    removedDays: existing.entries.filter((e) => !theirs.has(e.date)).map((e) => e.date),
    addedBudgetChanges: incoming.budgetChanges.filter((c) => !existing.budgetChanges.some(sameChange(c))),
    removedBudgetChanges: existing.budgetChanges.filter((c) => !incoming.budgetChanges.some(sameChange(c))),
    fieldChanges: fieldChanges(existing, incoming),
    youStopEditing: existing.editorInstallId === installId && !editableAfter,
    editableAfter,
  };
}

/**
 * Adds a new trip, or replaces your copy: the current state is saved as a
 * version first, then the file's trip becomes current and is saved too.
 */
export function applyImport(
  record: TripRecord | null,
  file: TripFile,
  now: number,
  newId: () => string,
): TripRecord {
  if (!record) return newRecord(file.trip, 'imported', file.exportedBy, now, newId());
  const saved = addVersion(record, 'beforeImport', '', now, newId());
  return addVersion({ ...saved, trip: file.trip }, 'imported', file.exportedBy, now, newId());
}
