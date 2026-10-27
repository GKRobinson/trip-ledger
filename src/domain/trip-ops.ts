import { formatDate, isIsoDate, tripLength, type IsoDate } from './dates';
import { isCents, type Cents } from './money';
import type { Amount, BudgetChange, DayEntry, EditMeta, Method, Pool, Rate, Trip } from './types';

/**
 * Pure edits on a trip: each returns a new Trip and never mutates its input.
 * Saving and versioning happen elsewhere (versions.ts, storage).
 */

export const LIMITS = {
  nameLength: 60,
  currencyLength: 8,
  maxTripDays: 1000,
  maxPools: 8,
  poolNameLength: 30,
  noteLength: 100,
  maxAmountsPerPool: 200,
  userNameLength: 40,
} as const;

export interface TripSettingsInput {
  name: string;
  currency: string;
  startDate: IsoDate;
  endDate: IsoDate;
  method: Method;
  startingBudget: Cents;
  pools: Pool[];
}

/** Problems that stop trip settings from being saved, in plain words. */
export function settingsProblems(input: TripSettingsInput, existing?: Trip): string[] {
  const problems: string[] = [];
  const name = input.name.trim();
  if (!name) problems.push('Give the trip a name.');
  else if (name.length > LIMITS.nameLength) problems.push(`Keep the name under ${LIMITS.nameLength} characters.`);

  const currency = input.currency.trim();
  if (!currency) problems.push('Enter a currency label, e.g. USD.');
  else if (currency.length > LIMITS.currencyLength) problems.push(`Keep the currency label under ${LIMITS.currencyLength} characters.`);

  const datesOk = isIsoDate(input.startDate) && isIsoDate(input.endDate);
  if (!datesOk) problems.push('Choose a start date and an end date.');
  else if (input.endDate < input.startDate) problems.push('The end date is before the start date.');
  else if (tripLength(input.startDate, input.endDate) > LIMITS.maxTripDays) {
    problems.push(`Trips can be at most ${LIMITS.maxTripDays} days long.`);
  }

  if (!isCents(input.startingBudget) || input.startingBudget <= 0) problems.push('Enter a budget above zero.');

  const poolNames = input.pools.map((p) => p.name.trim());
  if (input.pools.length === 0) problems.push('Keep at least one pool.');
  if (input.pools.length > LIMITS.maxPools) problems.push(`Use at most ${LIMITS.maxPools} pools.`);
  if (poolNames.some((n) => !n)) problems.push('Give every pool a name.');
  if (poolNames.some((n) => n.length > LIMITS.poolNameLength)) problems.push(`Keep pool names under ${LIMITS.poolNameLength} characters.`);
  if (new Set(poolNames.map((n) => n.toLowerCase())).size !== poolNames.length) problems.push('Two pools have the same name.');

  for (const pool of input.pools) {
    if (!pool.foreign) continue;
    const name = pool.name.trim() || 'A pool';
    const label = pool.foreign.currency.trim();
    if (!label || label.length > LIMITS.currencyLength) problems.push(`Give “${name}” a currency label of up to ${LIMITS.currencyLength} characters.`);
    else if (label.toUpperCase() === currency.toUpperCase()) {
      problems.push(`“${name}” is in ${label.toUpperCase()}, the trip’s own currency, so it needs no exchange rate.`);
    }
    if (pool.foreign.rates.length === 0) problems.push(`“${name}” needs an exchange rate: what you paid for what you got.`);
    for (const rate of pool.foreign.rates) problems.push(...rateProblems(rate).map((p) => `“${name}”: ${p}`));
  }

  if (existing) {
    if (input.method !== existing.method && existing.entries.length > 0) {
      problems.push('The recording method can’t change once the trip has entries.');
    }
    const currencyOf = (p: Pool) => (p.foreign ? p.foreign.currency.trim().toUpperCase() : null);
    for (const pool of existing.pools) {
      const used = existing.entries.some((e) => (e.amounts[pool.id] ?? []).length > 0);
      const next = input.pools.find((p) => p.id === pool.id);
      if (used && !next) problems.push(`“${pool.name}” has amounts recorded, so it can’t be removed.`);
      else if (used && next && currencyOf(next) !== currencyOf(pool)) {
        problems.push(`“${pool.name}” has amounts recorded, so its currency can’t change.`);
      }
    }
    if (datesOk && input.endDate >= input.startDate) {
      const outside = (d: IsoDate) => d < input.startDate || d > input.endDate;
      const entriesOut = existing.entries.filter((e) => outside(e.date)).map((e) => formatDate(e.date, true));
      if (entriesOut.length) problems.push(`Entries on ${entriesOut.join(', ')} would fall outside these dates.`);
      const changesOut = existing.budgetChanges.filter((c) => outside(c.date)).map((c) => formatDate(c.date, true));
      if (changesOut.length) problems.push(`Budget changes on ${changesOut.join(', ')} would fall outside these dates.`);
    }
  }
  return problems;
}

function cleanSettings(input: TripSettingsInput): TripSettingsInput {
  return {
    ...input,
    name: input.name.trim(),
    currency: input.currency.trim().toUpperCase(),
    pools: input.pools.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      foreign: p.foreign
        ? { currency: p.foreign.currency.trim().toUpperCase(), rates: sortByDate(p.foreign.rates.map((r) => ({ ...r, note: r.note.trim() }))) }
        : null,
    })),
  };
}

/** Stable: items on the same date keep the order they were added. */
function sortByDate<T extends { date: IsoDate }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const stamped = (trip: Trip, meta: EditMeta): Trip => ({ ...trip, updatedAt: meta.now, updatedBy: meta.userName });

/** Callers check `settingsProblems` first. */
export function createTrip(input: TripSettingsInput, id: string, installId: string, meta: EditMeta): Trip {
  return {
    id,
    ...cleanSettings(input),
    budgetChanges: [],
    entries: [],
    editorInstallId: installId,
    updatedAt: meta.now,
    updatedBy: meta.userName,
  };
}

/** Callers check `settingsProblems(input, trip)` first. Entries are always kept. */
export function updateSettings(trip: Trip, input: TripSettingsInput, meta: EditMeta): Trip {
  return stamped({ ...trip, ...cleanSettings(input) }, meta);
}

/** Problems that stop a day's entry from being saved. */
export function entryProblems(trip: Trip, entry: DayEntry): string[] {
  const problems: string[] = [];
  if (!isIsoDate(entry.date)) problems.push('Choose a date.');
  else if (entry.date < trip.startDate || entry.date > trip.endDate) problems.push('That date is outside the trip.');
  const poolIds = new Set(trip.pools.map((p) => p.id));
  const lists = Object.entries(entry.amounts);
  if (lists.every(([, amounts]) => amounts.length === 0)) problems.push('Enter at least one amount.');
  for (const [poolId, amounts] of lists) {
    if (!poolIds.has(poolId)) problems.push('An amount belongs to a pool that no longer exists.');
    if (amounts.length > LIMITS.maxAmountsPerPool) problems.push(`At most ${LIMITS.maxAmountsPerPool} amounts per pool.`);
    if (amounts.some((a) => !isCents(a.cents))) problems.push('One of the amounts isn’t a valid number.');
    if (amounts.some((a) => a.note.length > LIMITS.noteLength)) problems.push(`Keep notes under ${LIMITS.noteLength} characters.`);
  }
  return problems;
}

/** Adds the day's entry, or replaces the one already on that date. */
export function putEntry(trip: Trip, entry: DayEntry, meta: EditMeta): Trip {
  const amounts: Record<string, Amount[]> = {};
  for (const pool of trip.pools) {
    const list = entry.amounts[pool.id];
    if (list && list.length) amounts[pool.id] = list.map((a) => ({ cents: a.cents, note: a.note.trim() }));
  }
  const entries = trip.entries.filter((e) => e.date !== entry.date);
  entries.push({ date: entry.date, amounts });
  entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  return stamped({ ...trip, entries }, meta);
}

export function removeEntry(trip: Trip, date: IsoDate, meta: EditMeta): Trip {
  return stamped({ ...trip, entries: trip.entries.filter((e) => e.date !== date) }, meta);
}

export function budgetChangeProblems(trip: Trip, change: BudgetChange): string[] {
  const problems: string[] = [];
  if (!isIsoDate(change.date)) problems.push('Choose a date.');
  else if (change.date < trip.startDate || change.date > trip.endDate) problems.push('That date is outside the trip.');
  if (!isCents(change.cents) || change.cents === 0) problems.push('Enter an amount above zero.');
  if (change.note.trim().length > LIMITS.noteLength) problems.push(`Keep the note under ${LIMITS.noteLength} characters.`);
  return problems;
}

export function addBudgetChange(trip: Trip, change: BudgetChange, meta: EditMeta): Trip {
  const budgetChanges = sortByDate([...trip.budgetChanges, { ...change, note: change.note.trim() }]);
  return stamped({ ...trip, budgetChanges }, meta);
}

/** Problems with an exchange rate on its own (the pool is checked by callers). */
export function rateProblems(rate: Rate): string[] {
  const problems: string[] = [];
  if (!isIsoDate(rate.date)) problems.push('Choose the date the rate applies from.');
  if (!isCents(rate.paid) || rate.paid <= 0) problems.push('Enter what you paid, above zero.');
  if (!isCents(rate.got) || rate.got <= 0) problems.push('Enter what you got, above zero.');
  if (rate.note.trim().length > LIMITS.noteLength) problems.push(`Keep the note under ${LIMITS.noteLength} characters.`);
  return problems;
}

function withRates(trip: Trip, poolId: string, change: (rates: Rate[]) => Rate[], meta: EditMeta): Trip {
  const pools = trip.pools.map((p) =>
    p.id === poolId && p.foreign ? { ...p, foreign: { ...p.foreign, rates: sortByDate(change(p.foreign.rates)) } } : p,
  );
  return stamped({ ...trip, pools }, meta);
}

/** Callers check `rateProblems` first. */
export function addRate(trip: Trip, poolId: string, rate: Rate, meta: EditMeta): Trip {
  return withRates(trip, poolId, (rates) => [...rates, { ...rate, note: rate.note.trim() }], meta);
}

/** A pool in another currency keeps at least one rate; removing its last one does nothing. */
export function removeRate(trip: Trip, poolId: string, rateId: string, meta: EditMeta): Trip {
  return withRates(trip, poolId, (rates) => (rates.length > 1 ? rates.filter((r) => r.id !== rateId) : rates), meta);
}

export function removeBudgetChange(trip: Trip, id: string, meta: EditMeta): Trip {
  return stamped({ ...trip, budgetChanges: trip.budgetChanges.filter((c) => c.id !== id) }, meta);
}

export function isEditable(trip: Trip, installId: string): boolean {
  return trip.editorInstallId === installId;
}

/** "Start editing": this install becomes the trip's editor. */
export function takeOverEditing(trip: Trip, installId: string, meta: EditMeta): Trip {
  return stamped({ ...trip, editorInstallId: installId }, meta);
}
