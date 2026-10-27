import type { Amount, DayEntry, Trip } from '../src/domain/types';

export const ME = 'install-me';
export const SAM = 'install-sam';
export const META = { now: 1_000, userName: 'Greg' };

let counter = 0;
/** Deterministic ids, unique within a test run. */
export const testId = () => `id-${++counter}`;

/** A 10-day trip from 1 to 10 Nov 2026 with a 1,000.00 budget and one pool. */
export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    name: 'Test trip',
    currency: 'USD',
    startDate: '2026-11-01',
    endDate: '2026-11-10',
    method: 'runningTotal',
    startingBudget: 100_000,
    pools: [{ id: 'pool-a', name: 'Main', foreign: null }],
    budgetChanges: [],
    entries: [],
    editorInstallId: ME,
    updatedAt: 500,
    updatedBy: 'Greg',
    ...overrides,
  };
}

/** An entry with amounts in pool-a (and optionally pool-b). */
export function entry(date: string, a: number[], b?: number[]): DayEntry {
  const toAmounts = (list: number[]): Amount[] => list.map((cents) => ({ cents, note: '' }));
  return { date, amounts: { 'pool-a': toAmounts(a), ...(b ? { 'pool-b': toAmounts(b) } : {}) } };
}
