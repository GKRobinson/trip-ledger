import { describe, expect, it } from 'vitest';
import { entryWarnings } from '../src/domain/checks';
import { sampleTrips } from '../src/domain/samples';
import { budgetOn, spendSeries, totalBudget, tripStats } from '../src/domain/stats';
import { META, ME, entry, makeTrip, testId } from './helpers';

describe('running total', () => {
  const trip = makeTrip({
    method: 'runningTotal',
    entries: [entry('2026-11-01', [10_000]), entry('2026-11-02', [20_000, 5_000])],
  });

  it('takes the latest total as spent and spreads the rest over the days left', () => {
    const s = tripStats(trip);
    expect(s.tripDays).toBe(10);
    expect(s.spent).toBe(25_000);
    expect(s.remaining).toBe(75_000);
    expect(s.daysLeft).toBe(8);
    expect(s.perDayLeft).toBe(9_375);
    expect(s.averagePerDay).toBe(12_500);
    expect(s.evenPacePerDay).toBe(10_000);
    expect(s.paceDelta).toBe(5_000);
  });
});

describe('money left', () => {
  const trip = makeTrip({
    method: 'moneyLeft',
    pools: [
      { id: 'pool-a', name: 'Cash' },
      { id: 'pool-b', name: 'Card' },
    ],
    budgetChanges: [{ id: 'c1', date: '2026-11-03', cents: 20_000, note: 'Gift' }],
    entries: [entry('2026-11-01', [90_000]), entry('2026-11-03', [60_000], [40_000])],
  });

  it('measures each day against the budget as it stood that day', () => {
    expect(budgetOn(trip, '2026-11-02')).toBe(100_000);
    expect(budgetOn(trip, '2026-11-03')).toBe(120_000);
    expect(spendSeries(trip).map((p) => p.spent)).toEqual([10_000, 20_000]);
  });

  it('counts added money in the budget and in what is left', () => {
    const s = tripStats(trip);
    expect(totalBudget(trip)).toBe(120_000);
    expect(s.budgetAdded).toBe(20_000);
    expect(s.remaining).toBe(100_000); // exactly what was counted in the pools
  });
});

describe('daily spend', () => {
  const trip = makeTrip({
    method: 'dailySpend',
    entries: [entry('2026-11-01', [1_000, 2_550]), entry('2026-11-03', [5_000])],
  });

  it('adds up the days, counting a missing day as nothing spent', () => {
    expect(spendSeries(trip).map((p) => p.spent)).toEqual([3_550, 8_550]);
    expect(tripStats(trip).missingDates).toEqual(['2026-11-02']);
  });
});

describe('before any entries', () => {
  it('offers the even pace as the amount per day', () => {
    const s = tripStats(makeTrip());
    expect(s.last).toBeNull();
    expect(s.perDayLeft).toBe(10_000);
    expect(s.daysLeft).toBe(10);
  });
});

describe('on the last day', () => {
  it('shows everything left rather than dividing by zero', () => {
    const s = tripStats(makeTrip({ entries: [entry('2026-11-10', [90_000])] }));
    expect(s.daysLeft).toBe(0);
    expect(s.perDayLeft).toBe(10_000);
  });
});

describe('sample trips', () => {
  it('give sensible figures for every method', () => {
    const [running, left, daily] = sampleTrips('2026-11-12', ME, META, testId);
    expect(tripStats(running!).spent).toBe(151_000);
    // Money left: 600,000 + 50,000 added - (41,000 + 440,000) left.
    expect(tripStats(left!).spent).toBe(169_000);
    expect(tripStats(daily!).missingDates).toHaveLength(1);
    for (const trip of [running!, left!, daily!]) {
      const series = spendSeries(trip);
      expect(series.every((p, i) => i === 0 || p.spent >= series[i - 1]!.spent)).toBe(true);
    }
  });
});

describe('entry warnings', () => {
  const today = '2026-11-05';

  it('flags a running total lower than the day before', () => {
    const trip = makeTrip({ entries: [entry('2026-11-01', [10_000])] });
    expect(entryWarnings(trip, '2026-11-02', 9_000, today)[0]).toMatch(/Lower than your total/);
    expect(entryWarnings(trip, '2026-11-02', 11_000, today)).toEqual([]);
  });

  it('allows more money left when the difference was recorded as added', () => {
    const trip = makeTrip({
      method: 'moneyLeft',
      budgetChanges: [{ id: 'c1', date: '2026-11-02', cents: 20_000, note: '' }],
      entries: [entry('2026-11-01', [90_000])],
    });
    expect(entryWarnings(trip, '2026-11-03', 105_000, today)).toEqual([]);
    expect(entryWarnings(trip, '2026-11-03', 115_000, today)[0]).toMatch(/More than you had left/);
  });

  it('flags a negative day and a future date', () => {
    const trip = makeTrip({ method: 'dailySpend' });
    expect(entryWarnings(trip, '2026-11-02', -500, today)).toEqual(['This day adds up to less than zero.']);
    expect(entryWarnings(trip, '2026-11-08', 500, today)).toEqual(['This date is in the future.']);
  });
});
