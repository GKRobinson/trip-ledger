import { describe, expect, it } from 'vitest';
import { rateOn, rateText, toTripCents } from '../src/domain/currency';
import { parseTripFile, serializeTripFile } from '../src/domain/file-format';
import { previewImport } from '../src/domain/import';
import { sampleTrips } from '../src/domain/samples';
import { spendSeries } from '../src/domain/stats';
import { addRate, removeRate, settingsProblems, type TripSettingsInput } from '../src/domain/trip-ops';
import type { Pool, Rate } from '../src/domain/types';
import { META, ME, entry, makeTrip, testId } from './helpers';

const rate = (date: string, paid: number, got: number, id = testId()): Rate => ({ id, date, paid, got, note: '' });
// 30,000 JPY for 312.40 AUD on 2 Nov, then 20,000 JPY for 205.00 AUD on 6 Nov.
const cash: Pool = {
  id: 'pool-b',
  name: 'Cash',
  foreign: { currency: 'JPY', rates: [rate('2026-11-02', 31_240, 3_000_000, 'r1'), rate('2026-11-06', 20_500, 2_000_000, 'r2')] },
};
const card: Pool = { id: 'pool-a', name: 'Card', foreign: null };

describe('rates', () => {
  it('uses the latest rate on or before the date, and the first rate before that', () => {
    expect(rateOn(cash.foreign!, '2026-11-05').id).toBe('r1');
    expect(rateOn(cash.foreign!, '2026-11-06').id).toBe('r2');
    expect(rateOn(cash.foreign!, '2026-11-01').id).toBe('r1');
  });

  it('converts what was typed at what the cash actually cost', () => {
    // 1,680 JPY at 312.40 AUD per 30,000 JPY = 17.4944 AUD
    expect(toTripCents(cash, 168_000, '2026-11-03')).toBe(1_749);
    expect(toTripCents(card, 168_000, '2026-11-03')).toBe(168_000);
  });

  it('reads the way people quote rates', () => {
    expect(rateText(rate('2026-11-02', 31_240, 3_000_000), 'JPY', 'AUD')).toMatch(/^1 AUD = 96[.,]03 JPY$/);
    expect(rateText(rate('2026-11-02', 16_400, 10_000), 'EUR', 'AUD')).toMatch(/^1 EUR = 1[.,]64 AUD$/);
  });
});

describe('spending in two currencies', () => {
  it('converts each day at the rate for that day', () => {
    const japan = sampleTrips('2026-11-12', ME, META, testId)[2]!;
    const days = spendSeries(japan);
    // Day 1: 186.50 AUD card + 1,680 JPY cash (17.49 AUD).
    expect(days[0]!.spent).toBe(18_650 + 1_749);
    // Day 6 is after the second withdrawal: 3,450 JPY at 205 AUD per 20,000 JPY.
    const day5 = days[4]!.spent - days[3]!.spent;
    const day6 = days[5]!.spent - days[4]!.spent;
    expect(day5).toBe(18_650 + 1_770); // 1,700 JPY at the first rate
    expect(day6).toBe(3_536);
  });

  it('keeps money left unchanged by a cash withdrawal', () => {
    const trip = makeTrip({
      method: 'moneyLeft',
      currency: 'AUD',
      pools: [card, cash],
      entries: [
        entry('2026-11-01', [90_000]),
        // Withdrew 30,000 JPY: the card is down 312.40 AUD, the cash pool up the same value.
        entry('2026-11-02', [90_000 - 31_240], [3_000_000]),
      ],
    });
    expect(spendSeries(trip).map((p) => p.spent)).toEqual([10_000, 10_000]);
  });
});

describe('pool currency rules', () => {
  const settings = (trip = makeTrip(), pools: Pool[] = trip.pools): TripSettingsInput => ({
    name: trip.name,
    currency: trip.currency,
    startDate: trip.startDate,
    endDate: trip.endDate,
    method: trip.method,
    startingBudget: trip.startingBudget,
    pools,
  });

  it('needs a rate, and a currency other than the trip’s', () => {
    const noRate: Pool = { id: 'p', name: 'Cash', foreign: { currency: 'JPY', rates: [] } };
    const same: Pool = { id: 'q', name: 'Wallet', foreign: { currency: 'usd', rates: [rate('2026-11-01', 1, 1)] } };
    expect(settingsProblems(settings(makeTrip(), [noRate, same]))).toEqual([
      '“Cash” needs an exchange rate: what you paid for what you got.',
      '“Wallet” is in USD, the trip’s own currency, so it needs no exchange rate.',
    ]);
  });

  it('won’t change the currency of a pool with amounts recorded', () => {
    const trip = makeTrip({ pools: [card, cash], entries: [entry('2026-11-03', [], [100])] });
    const switched: Pool = { ...cash, foreign: { ...cash.foreign!, currency: 'KRW' } };
    expect(settingsProblems(settings(trip, [card, switched]), trip)).toEqual([
      '“Cash” has amounts recorded, so its currency can’t change.',
    ]);
    expect(settingsProblems(settings(trip, [card, { ...cash, foreign: null }]), trip)).toHaveLength(1);
  });

  it('adds rates in date order and always keeps one', () => {
    let trip = makeTrip({ pools: [card, cash] });
    trip = addRate(trip, 'pool-b', rate('2026-11-04', 10_000, 1_000_000, 'r3'), META);
    expect(trip.pools[1]!.foreign!.rates.map((r) => r.id)).toEqual(['r1', 'r3', 'r2']);
    trip = removeRate(removeRate(removeRate(trip, 'pool-b', 'r1', META), 'pool-b', 'r2', META), 'pool-b', 'r3', META);
    expect(trip.pools[1]!.foreign!.rates.map((r) => r.id)).toEqual(['r3']);
  });
});

describe('currency in trip files', () => {
  it('refuses a foreign pool without a usable rate', () => {
    const empty = serializeTripFile(makeTrip({ pools: [{ ...cash, foreign: { currency: 'JPY', rates: [] } }] }), '', 1);
    const zero = serializeTripFile(makeTrip({ pools: [{ ...cash, foreign: { currency: 'JPY', rates: [rate('2026-11-01', 100, 0)] } }] }), '', 1);
    const error = (text: string) => {
      const r = parseTripFile(text);
      return r.ok ? 'parsed' : r.error;
    };
    expect(error(empty)).toMatch(/foreign\.rates is empty/);
    expect(error(zero)).toMatch(/got is not above zero/);
  });

  it('shows rate changes in the import preview', () => {
    const mine = makeTrip({ currency: 'AUD', pools: [card, cash] });
    const theirs = addRate(mine, 'pool-b', rate('2026-11-08', 10_000, 1_000_000), META);
    const change = previewImport(mine, { exportedAt: 1, exportedBy: 'Sam', trip: theirs }, ME).fieldChanges;
    expect(change.map((c) => c.label)).toEqual(['Exchange rates']);
    expect(change[0]!.to).toMatch(/from 8 Nov|from Nov 8/);
  });
});
