import { daysBetween, formatDate, type IsoDate } from '../domain/dates';
import { METHOD_TITLES } from '../domain/labels';
import { formatMoney, type Cents } from '../domain/money';
import type { Method, Trip, Version } from '../domain/types';

export const METHOD_INFO: Record<Method, { title: string; summary: string; example: string; entryLabel: string; placeholder: string }> = {
  runningTotal: {
    title: METHOD_TITLES.runningTotal,
    summary: 'Each day, enter the total spent since the trip began.',
    example: 'Day 1: 180 · Day 2: 310 · Day 3: 455',
    entryLabel: 'Total spent so far',
    placeholder: 'Spent so far',
  },
  moneyLeft: {
    title: METHOD_TITLES.moneyLeft,
    summary: 'Each day, enter how much money you have left.',
    example: 'Day 1: 11,820 · Day 2: 11,690 · Day 3: 11,545',
    entryLabel: 'Money left',
    placeholder: 'Left',
  },
  dailySpend: {
    title: METHOD_TITLES.dailySpend,
    summary: 'Enter what you spent each day, adding up receipts as you go.',
    example: 'Day 1: 180 · Day 2: 130 · Day 3: 145',
    entryLabel: 'Spent on this day',
    placeholder: 'Amount',
  },
};

export function versionLabel(v: Version): string {
  switch (v.kind) {
    case 'created':
      return 'Trip created';
    case 'exported':
      return 'Exported';
    case 'imported':
      return v.detail ? `Imported from ${v.detail}` : 'Imported from a file';
    case 'beforeImport':
      return 'Before an import';
    case 'beforeSwitch':
      return 'Before switching versions';
    case 'beforeDelete':
      return `Before deleting ${v.detail}`;
    case 'beforeEdit':
      return `Before editing ${v.detail}`;
    case 'beforeSettings':
      return 'Before changing trip settings';
  }
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "+500" / "−120" */
export function signedMoney(cents: Cents): string {
  return `${cents < 0 ? '−' : '+'}${formatMoney(Math.abs(cents))}`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function dateRange(trip: Trip): string {
  return `${formatDate(trip.startDate)} – ${formatDate(trip.endDate, true)}`;
}

export type Phase = { kind: 'upcoming'; inDays: number } | { kind: 'active' } | { kind: 'ended' };

export function tripPhase(trip: Trip, today: IsoDate): Phase {
  if (today < trip.startDate) return { kind: 'upcoming', inDays: daysBetween(today, trip.startDate) };
  return today > trip.endDate ? { kind: 'ended' } : { kind: 'active' };
}
