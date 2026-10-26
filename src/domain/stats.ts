import { addDays, dayNumber, tripLength, type IsoDate } from './dates';
import type { Cents } from './money';
import type { DayEntry, Trip } from './types';

/** Everything typed for a day, added up across pools. */
export function entryTotal(entry: DayEntry): Cents {
  let sum = 0;
  for (const amounts of Object.values(entry.amounts)) for (const a of amounts) sum += a.cents;
  return sum;
}

export function poolTotal(entry: DayEntry, poolId: string): Cents {
  return (entry.amounts[poolId] ?? []).reduce((sum, a) => sum + a.cents, 0);
}

/** Net of all budget changes, whatever their date. */
export function budgetAdded(trip: Trip): Cents {
  return trip.budgetChanges.reduce((sum, c) => sum + c.cents, 0);
}

/** The whole budget: the starting budget plus every recorded change. */
export function totalBudget(trip: Trip): Cents {
  return trip.startingBudget + budgetAdded(trip);
}

/** The budget as it stood on `date`, counting changes made up to that day. */
export function budgetOn(trip: Trip, date: IsoDate): Cents {
  return trip.budgetChanges.reduce((sum, c) => (c.date <= date ? sum + c.cents : sum), trip.startingBudget);
}

export interface SpendPoint {
  date: IsoDate;
  day: number;
  /** Total spent from the start of the trip up to and including this date. */
  spent: Cents;
}

/**
 * The one place the three recording methods are interpreted. Each entry
 * becomes "total spent by this date":
 * - runningTotal: what was typed.
 * - moneyLeft:    the budget on that date minus what was typed. Using the
 *                 budget *on that date* is what keeps a later top-up from
 *                 looking like extra spending on every earlier day.
 * - dailySpend:   the sum of every day up to this one. A day with no entry
 *                 counts as nothing spent.
 */
export function spendSeries(trip: Trip): SpendPoint[] {
  let running = 0;
  return trip.entries.map((entry) => {
    const total = entryTotal(entry);
    let spent: Cents;
    switch (trip.method) {
      case 'runningTotal':
        spent = total;
        break;
      case 'moneyLeft':
        spent = budgetOn(trip, entry.date) - total;
        break;
      case 'dailySpend':
        running += total;
        spent = running;
        break;
    }
    return { date: entry.date, day: dayNumber(trip.startDate, entry.date), spent };
  });
}

export interface TripStats {
  tripDays: number;
  budget: Cents;
  budgetAdded: Cents;
  /** budget / tripDays, in cents per day. */
  evenPacePerDay: number;
  /** The latest entry, or null before the first one. */
  last: SpendPoint | null;
  spent: Cents;
  remaining: Cents;
  /** Days after the latest entry's day (the whole trip before any entry). */
  daysLeft: number;
  /** The headline: remaining / daysLeft, or all of it on the last day. */
  perDayLeft: number;
  averagePerDay: number | null;
  /** spent minus where an even pace would be; positive means over pace. */
  paceDelta: number | null;
  /** dailySpend only: dates up to the latest entry that have no entry. */
  missingDates: IsoDate[];
}

export function tripStats(trip: Trip): TripStats {
  const tripDays = tripLength(trip.startDate, trip.endDate);
  const budget = totalBudget(trip);
  const series = spendSeries(trip);
  const last = series.at(-1) ?? null;
  const spent = last?.spent ?? 0;
  const day = last?.day ?? 0;
  const remaining = budget - spent;
  const daysLeft = tripDays - day;
  const evenPacePerDay = budget / tripDays;
  return {
    tripDays,
    budget,
    budgetAdded: budgetAdded(trip),
    evenPacePerDay,
    last,
    spent,
    remaining,
    daysLeft,
    perDayLeft: daysLeft > 0 ? remaining / daysLeft : remaining,
    averagePerDay: last ? spent / day : null,
    paceDelta: last ? spent - evenPacePerDay * day : null,
    missingDates: trip.method === 'dailySpend' && last ? missingDates(trip, last.date) : [],
  };
}

function missingDates(trip: Trip, through: IsoDate): IsoDate[] {
  const have = new Set(trip.entries.map((e) => e.date));
  const missing: IsoDate[] = [];
  for (let d = trip.startDate; d <= through; d = addDays(d, 1)) if (!have.has(d)) missing.push(d);
  return missing;
}
