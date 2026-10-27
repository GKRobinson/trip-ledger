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
    name: 'Sample · Road trip (running total)',
    currency: 'AUD',
    method: 'runningTotal',
    startingBudget: 400_000,
    pools: [{ id: main, name: 'Spending', foreign: null }],
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
      { id: cash, name: 'Cash', foreign: null },
      { id: card, name: 'Card', foreign: null },
    ],
    budgetChanges: [{ id: newId(), date: day(6), cents: 50_000, note: 'Birthday money' }],
    entries: left.map(([c, k], i) => ({ date: day(i + 1), amounts: { [cash]: amounts(c), [card]: amounts(k) } })),
  };

  // Daily spend in two currencies: card payments in AUD from the bank feed,
  // cash receipts in yen at the rate two ATM withdrawals actually cost.
  // Day 7 has no entry.
  const jpCard = newId();
  const jpCash = newId();
  const receipts: Array<[Array<[number, string]>, Array<[number, string]>]> = [
    [[[18_650, 'Hotel']], [[120_000, 'Ramen'], [48_000, 'Train']]],
    [[[4_500, 'Museum']], [[98_000, 'Lunch'], [32_000, 'Coffee']]],
    [[], [[250_000, 'Onsen'], [150_000, 'Dinner']]],
    [[[12_000, 'Shinkansen']], [[80_000, 'Bento']]],
    [[[18_650, 'Hotel']], [[60_000, 'Temple'], [110_000, 'Dinner']]],
    [[], [[300_000, 'Market'], [45_000, 'Bus']]],
    [[], []],
    [[[9_900, 'Dinner']], [[70_000, 'Breakfast']]],
    [[[22_000, 'Day tour']], [[52_000, 'Lunch']]],
    [[], [[180_000, 'Souvenirs'], [65_000, 'Ramen']]],
    [[[18_650, 'Hotel']], [[40_000, 'Coffee']]],
  ];
  const daily: Trip = {
    ...base,
    id: newId(),
    name: 'Sample · Japan (daily spend)',
    currency: 'AUD',
    method: 'dailySpend',
    startingBudget: 450_000,
    pools: [
      { id: jpCard, name: 'Card', foreign: null },
      {
        id: jpCash,
        name: 'Cash',
        foreign: {
          currency: 'JPY',
          rates: [
            { id: newId(), date: day(1), paid: 31_240, got: 3_000_000, note: 'ATM at the airport' },
            { id: newId(), date: day(6), paid: 20_500, got: 2_000_000, note: 'ATM in Kyoto' },
          ],
        },
      },
    ],
    budgetChanges: [],
    entries: receipts
      .map(([cardList, cashList], i): DayEntry | null => {
        const entryAmounts: Record<string, Amount[]> = {};
        if (cardList.length) entryAmounts[jpCard] = amounts(...cardList);
        if (cashList.length) entryAmounts[jpCash] = amounts(...cashList);
        return cardList.length + cashList.length ? { date: day(i + 1), amounts: entryAmounts } : null;
      })
      .filter((e): e is DayEntry => e !== null),
  };

  return [running, moneyLeft, daily];
}
