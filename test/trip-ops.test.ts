import { describe, expect, it } from 'vitest';
import {
  createTrip,
  entryProblems,
  isEditable,
  putEntry,
  removeEntry,
  settingsProblems,
  takeOverEditing,
  updateSettings,
  type TripSettingsInput,
} from '../src/domain/trip-ops';
import { META, ME, SAM, entry, makeTrip } from './helpers';

const settingsOf = (trip = makeTrip()): TripSettingsInput => ({
  name: trip.name,
  currency: trip.currency,
  startDate: trip.startDate,
  endDate: trip.endDate,
  method: trip.method,
  startingBudget: trip.startingBudget,
  pools: trip.pools,
});

describe('trip settings', () => {
  it('accepts a valid new trip and tidies its text', () => {
    const input = { ...settingsOf(), name: '  Japan  ', currency: 'jpy' };
    expect(settingsProblems(input)).toEqual([]);
    const trip = createTrip(input, 'trip-9', ME, META);
    expect(trip).toMatchObject({ name: 'Japan', currency: 'JPY', editorInstallId: ME, entries: [] });
  });

  it('explains what is wrong', () => {
    const problems = settingsProblems({
      ...settingsOf(),
      name: '',
      endDate: '2026-10-01',
      startingBudget: 0,
      pools: [
        { id: 'a', name: 'Cash' },
        { id: 'b', name: 'cash' },
      ],
    });
    expect(problems).toEqual([
      'Give the trip a name.',
      'The end date is before the start date.',
      'Enter a budget above zero.',
      'Two pools have the same name.',
    ]);
  });

  it('keeps every entry when settings are saved', () => {
    const trip = makeTrip({ entries: [entry('2026-11-01', [100]), entry('2026-11-02', [200])] });
    const updated = updateSettings(trip, { ...settingsOf(trip), name: 'Renamed', startingBudget: 200_000 }, META);
    expect(updated.entries).toEqual(trip.entries);
    expect(updated.name).toBe('Renamed');
  });

  it('refuses changes that would strand recorded data', () => {
    const trip = makeTrip({
      pools: [
        { id: 'pool-a', name: 'Cash' },
        { id: 'pool-b', name: 'Card' },
      ],
      entries: [entry('2026-11-08', [100], [50])],
    });
    const problems = settingsProblems(
      { ...settingsOf(trip), method: 'dailySpend', endDate: '2026-11-05', pools: [trip.pools[0]!] },
      trip,
    );
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/method can’t change/);
    expect(problems[1]).toMatch(/“Card” has amounts recorded/);
    expect(problems[2]).toMatch(/would fall outside these dates/);
  });
});

describe('entries', () => {
  it('replaces the entry on the same date and keeps dates in order', () => {
    let trip = makeTrip();
    trip = putEntry(trip, entry('2026-11-03', [300]), META);
    trip = putEntry(trip, entry('2026-11-01', [100]), META);
    trip = putEntry(trip, entry('2026-11-03', [350]), META);
    expect(trip.entries.map((e) => [e.date, e.amounts['pool-a']![0]!.cents])).toEqual([
      ['2026-11-01', 100],
      ['2026-11-03', 350],
    ]);
    expect(removeEntry(trip, '2026-11-01', META).entries).toHaveLength(1);
  });

  it('drops empty pools and trims notes', () => {
    const trip = makeTrip({ pools: [{ id: 'pool-a', name: 'A' }, { id: 'pool-b', name: 'B' }] });
    const saved = putEntry(trip, { date: '2026-11-01', amounts: { 'pool-a': [{ cents: 5, note: ' Tea ' }], 'pool-b': [] } }, META);
    expect(saved.entries[0]!.amounts).toEqual({ 'pool-a': [{ cents: 5, note: 'Tea' }] });
  });

  it('stamps who changed the trip and when', () => {
    const saved = putEntry(makeTrip(), entry('2026-11-01', [1]), { now: 9_999, userName: 'Sam' });
    expect(saved).toMatchObject({ updatedAt: 9_999, updatedBy: 'Sam' });
  });

  it('refuses entries outside the trip or with nothing in them', () => {
    const trip = makeTrip();
    expect(entryProblems(trip, entry('2026-12-01', [1]))).toEqual(['That date is outside the trip.']);
    expect(entryProblems(trip, { date: '2026-11-01', amounts: {} })).toEqual(['Enter at least one amount.']);
  });
});

describe('editing rights', () => {
  it('passes editing to whoever starts editing', () => {
    const theirs = makeTrip({ editorInstallId: SAM });
    expect(isEditable(theirs, ME)).toBe(false);
    expect(isEditable(takeOverEditing(theirs, ME, META), ME)).toBe(true);
  });
});
