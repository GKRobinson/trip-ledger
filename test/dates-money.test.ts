import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isIsoDate, todayIso, tripLength } from '../src/domain/dates';
import { centsToInput, formatMoney, parseAmount } from '../src/domain/money';

describe('dates', () => {
  it('counts trip length inclusively', () => {
    expect(tripLength('2026-11-01', '2026-11-30')).toBe(30);
    expect(tripLength('2026-11-01', '2026-11-01')).toBe(1);
  });

  it('is not shifted by daylight saving', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('accepts only real calendar dates', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
    expect(isIsoDate(20261101)).toBe(false);
  });

  it('reads today from the device calendar, not UTC', () => {
    expect(todayIso(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05');
    expect(todayIso(new Date(2026, 10, 5, 0, 1))).toBe('2026-11-05');
  });
});

describe('parseAmount', () => {
  const cents = (text: string) => {
    const r = parseAmount(text);
    return r.ok ? r.cents : r.error;
  };

  it('reads ordinary amounts as whole cents', () => {
    expect(cents('45.2')).toBe(4520);
    expect(cents('45.20')).toBe(4520);
    expect(cents('0.1')).toBe(10);
    expect(cents('.5')).toBe(50);
    expect(cents('5.')).toBe(500);
    expect(cents(' 1 000 ')).toBe(100_000);
    expect(cents('-12')).toBe(-1200);
    expect(cents('−5')).toBe(-500);
  });

  it('reads a lone comma as the decimal mark', () => {
    expect(cents('12,50')).toBe(1250);
  });

  it('refuses ambiguous or invalid input rather than guess', () => {
    expect(cents('12,500')).toBe('Leave out the thousands separator, e.g. 12500');
    expect(cents('1,000.50')).toBe('Leave out the thousands separator, e.g. 1000.50');
    expect(cents('1,000,000')).toBe('Leave out the thousands separator, e.g. 1000000');
    expect(cents('1.234')).toBe('Use at most 2 decimal places.');
    expect(cents('')).toBe('Enter an amount.');
    expect(cents('abc')).toBe('Numbers only, e.g. 45.20');
    expect(cents('1e5')).toBe('Numbers only, e.g. 45.20');
    expect(cents('-')).toBe('Numbers only, e.g. 45.20');
    expect(cents('99999999999999')).toBe('That amount is too large.');
  });

  it('never produces negative zero', () => {
    expect(Object.is(cents('-0'), 0)).toBe(true);
  });

  it('adds receipts without floating-point drift', () => {
    const sum = ['0.10', '0.20', '45.20', '12', '8.50'].reduce((s, t) => s + (cents(t) as number), 0);
    expect(sum).toBe(6600);
  });
});

describe('money display', () => {
  it('puts amounts back into input form', () => {
    expect(centsToInput(4520)).toBe('45.20');
    expect(centsToInput(4500)).toBe('45');
    expect(centsToInput(-1205)).toBe('-12.05');
    expect(centsToInput(5)).toBe('0.05');
  });

  it('shows decimals only when there are any', () => {
    expect(formatMoney(4500)).toMatch(/^45$/);
    expect(formatMoney(4520)).toMatch(/^45[.,]20$/);
    expect(formatMoney(-20, 0)).toBe('0');
  });
});
