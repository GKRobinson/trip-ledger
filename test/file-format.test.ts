import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  parseRecord,
  parseSettings,
  parseTripFile,
  serializeRecord,
  serializeSettings,
  serializeTripFile,
} from '../src/domain/file-format';
import { sampleTrips } from '../src/domain/samples';
import { newRecord } from '../src/domain/versions';
import { META, ME, entry, makeTrip, testId } from './helpers';

const parseError = (text: string) => {
  const r = parseTripFile(text);
  return r.ok ? 'parsed' : r.error;
};

describe('trip files', () => {
  it('round-trip every sample trip exactly', () => {
    for (const trip of sampleTrips('2026-11-12', ME, META, testId)) {
      const parsed = parseTripFile(serializeTripFile(trip, 'Greg', 1234));
      expect(parsed).toEqual({ ok: true, value: { exportedAt: 1234, exportedBy: 'Greg', trip } });
    }
  });

  it('refuse files that are not trip files, with a reason', () => {
    expect(parseError('not json')).toBe('This isn’t a Trip Ledger trip file (it isn’t valid JSON).');
    expect(parseError('[]')).toBe('This isn’t a Trip Ledger trip file.');
    expect(parseError('{"format":"something-else"}')).toBe('This isn’t a Trip Ledger trip file.');
  });

  it('recognise a backup from the old web app', () => {
    const old = JSON.stringify({ budget: 12000, tripDays: 60, currency: 'USD', entries: [] });
    expect(parseError(old)).toMatch(/old Trip Ledger web app/);
  });

  it('ask for an update when the file is from a newer app', () => {
    const newer = serializeTripFile(makeTrip(), '', 1).replace('"schemaVersion": 1', '"schemaVersion": 2');
    expect(parseError(newer)).toBe('This file was made by a newer version of Trip Ledger. Update the app to open it.');
  });

  it('point at the damaged part of a file', () => {
    const outside = serializeTripFile(makeTrip({ entries: [entry('2026-12-25', [1])] }), '', 1);
    expect(parseError(outside)).toBe('This trip file is damaged or incomplete (trip.entries[0].date is outside the trip dates).');

    const strayPool = serializeTripFile(makeTrip({ entries: [entry('2026-11-01', [1], [2])] }), '', 1);
    expect(parseError(strayPool)).toMatch(/refers to a pool that isn't in the trip/);

    const twice = serializeTripFile(makeTrip({ entries: [entry('2026-11-01', [1]), entry('2026-11-01', [2])] }), '', 1);
    expect(parseError(twice)).toMatch(/two entries on one date/);

    const fraction = serializeTripFile(makeTrip({ startingBudget: 10.5 }), '', 1);
    expect(parseError(fraction)).toMatch(/startingBudget is not a valid amount/);
  });

  it('put entries in date order whatever order the file has', () => {
    const shuffled = serializeTripFile(makeTrip({ entries: [entry('2026-11-05', [1]), entry('2026-11-02', [2])] }), '', 1);
    const r = parseTripFile(shuffled);
    expect(r.ok && r.value.trip.entries.map((e) => e.date)).toEqual(['2026-11-02', '2026-11-05']);
  });

  it('get a safe file name', () => {
    expect(exportFileName(makeTrip({ name: 'A/B: "trip"?' }), '2026-11-12')).toBe('AB trip 2026-11-12.tripledger.json');
    expect(exportFileName(makeTrip({ name: '???' }), '2026-11-12')).toBe('Trip 2026-11-12.tripledger.json');
  });
});

describe('stored records and settings', () => {
  it('round-trip', () => {
    const record = newRecord(makeTrip(), 'created', '', 1, 'v1');
    expect(parseRecord(serializeRecord(record))).toEqual({ ok: true, value: record });
    const settings = { installId: 'abc-123', userName: 'Greg' };
    expect(parseSettings(serializeSettings(settings))).toEqual({ ok: true, value: settings });
  });

  it('refuse a version that belongs to another trip', () => {
    const record = newRecord(makeTrip(), 'created', '', 1, 'v1');
    record.versions[0]!.trip = makeTrip({ id: 'trip-2' });
    const r = parseRecord(serializeRecord(record));
    expect(r.ok ? 'parsed' : r.error).toMatch(/belongs to a different trip/);
  });
});
