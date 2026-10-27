import { formatDate, type IsoDate } from './dates';
import { formatMoney, type Cents } from './money';
import { entryTotal } from './stats';
import type { Trip } from './types';

/**
 * Things worth a second look about a day's figure. Warnings only — a lower
 * running total can be a refund, more money left can be a top-up — so they
 * never block saving.
 */
export function entryWarnings(trip: Trip, date: IsoDate, total: Cents, today: IsoDate): string[] {
  const warnings: string[] = [];
  const others = trip.entries.filter((e) => e.date !== date);
  const prev = others.filter((e) => e.date < date).at(-1);
  const next = others.find((e) => e.date > date);
  const money = (cents: Cents) => `${formatMoney(cents)} ${trip.currency}`;

  switch (trip.method) {
    case 'runningTotal':
      if (prev && entryTotal(trip, prev) > total) {
        warnings.push(
          `Lower than your total on ${formatDate(prev.date)} (${money(entryTotal(trip, prev))}). Fine if it was a refund.`,
        );
      }
      if (next && entryTotal(trip, next) < total) {
        warnings.push(`Higher than your total on ${formatDate(next.date)} (${money(entryTotal(trip, next))}).`);
      }
      break;
    case 'moneyLeft':
      if (prev) {
        const added = trip.budgetChanges
          .filter((c) => c.date > prev.date && c.date <= date)
          .reduce((sum, c) => sum + c.cents, 0);
        if (total > entryTotal(trip, prev) + added) {
          warnings.push(
            `More than you had left on ${formatDate(prev.date)} (${money(entryTotal(trip, prev))})` +
              `${added ? ' plus money added since' : ''}. If money was added, record it under ` +
              `“Add or remove money” so your spending stays right.`,
          );
        }
      }
      break;
    case 'dailySpend':
      if (total < 0) warnings.push('This day adds up to less than zero.');
      break;
  }
  if (date > today) warnings.push('This date is in the future.');
  return warnings;
}
