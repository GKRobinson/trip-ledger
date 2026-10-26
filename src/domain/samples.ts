import { addDays, type IsoDate } from './dates';
import type { Amount, DayEntry, EditMeta, Trip } from './types';

/**
 * Dummy trips, one per recording method, for trying the app out and for
 * tests. Each started 12 days before `today` and runs 30 days. Ids are passed
 * in so every call can make fresh copies.
 */
export function sampleTrips(today: IsoDate, installId: string, meta: EditMeta, newId: () => string): Trip[] {
  const start = addDays(today, -11);
  const end = addDays(start, 29);
  const day = (n: number) => addDays(start, n - 1);
  const amounts = (...values: Array<number | [number, string]>): Amount[] =>
    values.map((v) => (Array.isArray(v) ? { cents: v[0], note: v[1] } : { cents: v, note: '' }));
  const base = {
    startDate: start,
    endDate: end,
    editorInstallId: installId,
    updatedAt: meta.now,
    updatedBy: meta.userName,
  };

  // Running total: one pool, the total spent so far each evening.
  const main = newId();
  const runningTotals = [18_000, 31_000, 45_550, 61_200, 70_400, 88_900, 101_500, 115_000, 126_300, 142_800, 151_000];
  const running: Trip = {
    ...base,
    id: newId(),
    name: 'Sample · Japan (running total)',
    currency: 'AUD',
    method: 'runningTotal',
    startingBudget: 400_000,
    pools: [{ id: main, name: 'Spending' }],
    budgetChanges: [],
    entries: runningTotals.map((cents, i) => ({ date: day(i + 1), amounts: { [main]: amounts(cents) } })),
  };

  // Money left: cash and a card counted each day, with a top-up on day 6.
  const cash = newId();
  const card = newId();
  const left: Array<[number, number]> = [
    [40_000, 560_000], [33_500, 548_000], [26_000, 541_200], [52_000, 501_000], [44_800, 492_300],
    [39_000, 529_900], [30_500, 517_000], [61_000, 470_250], [55_200, 462_000], [47_900, 451_400], [41_000, 440_000],
  ];
  const moneyLeft: Trip = {
    ...base,
    id: newId(),
    name: 'Sample · Europe (money left)',
    currency: 'EUR',
    method: 'moneyLeft',
    startingBudget: 600_000,
    pools: [
      { id: cash, name: 'Cash' },
      { id: card, name: 'Card' },
    ],
    budgetChanges: [{ id: newId(), date: day(6), cents: 50_000, note: 'Birthday money' }],
    entries: left.map(([c, k], i) => ({ date: day(i + 1), amounts: { [cash]: amounts(c), [card]: amounts(k) } })),
  };

  // Daily spend: receipts added up each day, with day 7 not recorded.
  const wallet = newId();
  const receipts: Array<Array<number | [number, string]>> = [
    [[4_520, 'Breakfast'], [12_000, 'Fuel'], [8_650, 'Dinner']],
    [[3_200, 'Coffee'], [9_900, 'Camp site']],
    [[15_480, 'Groceries'], [2_500, 'Parking']],
    [[6_000, 'Museum'], [7_340, 'Lunch'], [11_000, 'Fuel']],
    [[9_900, 'Camp site'], [4_150, 'Dinner']],
    [[2_890, 'Snacks']],
    [],
    [[18_700, 'Motel'], [5_600, 'Dinner']],
    [[13_200, 'Fuel'], [3_000, 'Ferry']],
    [[8_800, 'Groceries']],
    [[4_400, 'Coffee'], [9_950, 'Tour']],
  ];
  const daily: Trip = {
    ...base,
    id: newId(),
    name: 'Sample · Road trip (daily spend)',
    currency: 'AUD',
    method: 'dailySpend',
    startingBudget: 450_000,
    pools: [{ id: wallet, name: 'Spending' }],
    budgetChanges: [],
    entries: receipts
      .map((list, i): DayEntry | null => (list.length ? { date: day(i + 1), amounts: { [wallet]: amounts(...list) } } : null))
      .filter((e): e is DayEntry => e !== null),
  };

  return [running, moneyLeft, daily];
}
