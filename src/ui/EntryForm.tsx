import { forwardRef, useEffect, useRef, useState } from 'react';
import { entryWarnings } from '../domain/checks';
import { dayNumber, formatDate, isIsoDate } from '../domain/dates';
import { centsToInput, formatMoney, parseAmount } from '../domain/money';
import { toTripCents } from '../domain/currency';
import { entryTotal, poolTotal, spendSeries } from '../domain/stats';
import { LIMITS, entryProblems, putEntry } from '../domain/trip-ops';
import type { Amount, DayEntry, Trip } from '../domain/types';
import { Problems, Warnings } from './common';
import { METHOD_INFO } from './format';

interface Row {
  key: number;
  amount: string;
  note: string;
}

type Rows = Record<string, Row[]>;
type Source = { kind: 'existing' } | { kind: 'previous'; date: string } | { kind: 'blank' };

let rowKey = 0;
const row = (amount = '', note = ''): Row => ({ key: ++rowKey, amount, note });

/**
 * What the form starts with for a date: that day's saved amounts; otherwise,
 * for running-total and money-left trips, the previous day's figures (most
 * pools barely change day to day); otherwise empty rows.
 */
function initialRows(trip: Trip, date: string): { rows: Rows; source: Source } {
  const fromEntry = (entry: DayEntry): Rows =>
    Object.fromEntries(
      trip.pools.map((p) => {
        const list = entry.amounts[p.id] ?? [];
        return [p.id, list.length ? list.map((a) => row(centsToInput(a.cents), a.note)) : [row()]];
      }),
    );
  const existing = trip.entries.find((e) => e.date === date);
  if (existing) return { rows: fromEntry(existing), source: { kind: 'existing' } };
  if (trip.method !== 'dailySpend') {
    const prev = trip.entries.filter((e) => e.date < date).at(-1);
    if (prev) return { rows: fromEntry(prev), source: { kind: 'previous', date: prev.date } };
  }
  return { rows: Object.fromEntries(trip.pools.map((p) => [p.id, [row()]])), source: { kind: 'blank' } };
}

/** Reads the rows: the amounts to save, and an error per unreadable row. */
function readRows(rows: Rows): { amounts: Record<string, Amount[]>; errors: Map<number, string> } {
  const amounts: Record<string, Amount[]> = {};
  const errors = new Map<number, string>();
  for (const [poolId, list] of Object.entries(rows)) {
    const read: Amount[] = (amounts[poolId] = []);
    for (const r of list) {
      if (!r.amount.trim() && !r.note.trim()) continue;
      if (!r.amount.trim()) {
        errors.set(r.key, 'Enter an amount, or remove the row.');
        continue;
      }
      const parsed = parseAmount(r.amount);
      if (parsed.ok) read.push({ cents: parsed.cents, note: r.note.trim() });
      else errors.set(r.key, parsed.error);
    }
  }
  return { amounts, errors };
}

export const EntryForm = forwardRef<
  HTMLDivElement,
  {
    trip: Trip;
    date: string;
    today: string;
    onDateChange: (date: string) => void;
    onSave: (entry: DayEntry, existed: boolean) => Promise<boolean>;
  }
>(function EntryForm({ trip, date, today, onDateChange, onSave }, ref) {
  const savedEntry = trip.entries.find((e) => e.date === date) ?? null;
  const savedJson = JSON.stringify(savedEntry);
  const [state, setState] = useState(() => initialRows(trip, date));
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const focusKey = useRef<number | null>(null);

  // Reload when the date changes or that day's saved entry changes.
  useEffect(() => {
    setState(initialRows(trip, date));
    setProblems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, savedJson, trip.id]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const info = METHOD_INFO[trip.method];
  const dateOk = isIsoDate(date) && date >= trip.startDate && date <= trip.endDate;
  const { amounts, errors } = readRows(state.rows);
  const candidate: DayEntry = { date, amounts };
  const total = entryTotal(trip, candidate);
  const anyForeign = trip.pools.some((p) => p.foreign);
  const hasAmounts = Object.values(amounts).some((l) => l.length > 0);
  const spentBy = dateOk && hasAmounts
    ? spendSeries(putEntry(trip, candidate, { now: 0, userName: '' })).find((p) => p.date === date)?.spent
    : undefined;
  const warnings = dateOk && hasAmounts ? entryWarnings(trip, date, total, today) : [];
  const multi = trip.pools.length > 1;

  const setRows = (poolId: string, update: (rows: Row[]) => Row[]) =>
    setState((s) => ({ ...s, rows: { ...s.rows, [poolId]: update(s.rows[poolId] ?? []) } }));

  async function save() {
    const found = [...new Set(errors.values())];
    if (!dateOk) found.unshift('Choose a date within the trip.');
    else found.push(...entryProblems(trip, candidate));
    setProblems(found);
    if (found.length) return;
    if (await onSave(candidate, savedEntry !== null)) setSaved(true);
  }

  return (
    <div className="card entryform" ref={ref}>
      <span className="label">{info.entryLabel}</span>
      <div className="daterow">
        <input
          type="date"
          value={date}
          min={trip.startDate}
          max={trip.endDate}
          aria-label="Date"
          onChange={(e) => onDateChange(e.target.value)}
        />
        {dateOk && <span className="daytag">DAY {dayNumber(trip.startDate, date)}</span>}
      </div>
      <p className="small">
        {state.source.kind === 'existing' && `Editing ${formatDate(date)}. Saving replaces what’s recorded for this day.`}
        {state.source.kind === 'previous' && `Filled in from ${formatDate(state.source.date)} — change what’s different.`}
        {state.source.kind === 'blank' && (multi ? 'Enter amounts under each pool.' : 'Add more rows to add up several amounts.')}
      </p>

      {trip.pools.map((pool) => {
        const rows = state.rows[pool.id] ?? [];
        const typed = poolTotal(candidate, pool.id);
        return (
          <div key={pool.id} className="pool">
            {(multi || pool.foreign) && (
              <div className="poolname">
                {pool.name}
                {pool.foreign && <span className="poolcur"> · {pool.foreign.currency}</span>}
              </div>
            )}
            {rows.map((r) => (
              <div key={r.key} className={'amountrow' + (errors.has(r.key) ? ' bad' : '')}>
                <input
                  className="amt"
                  inputMode="decimal"
                  placeholder={info.placeholder}
                  value={r.amount}
                  aria-label={`${pool.name} amount`}
                  autoFocus={focusKey.current === r.key}
                  onChange={(e) => setRows(pool.id, (list) => list.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))}
                />
                <input
                  className="note"
                  placeholder="Note (optional)"
                  maxLength={LIMITS.noteLength}
                  value={r.note}
                  aria-label={`${pool.name} note`}
                  onChange={(e) => setRows(pool.id, (list) => list.map((x) => (x.key === r.key ? { ...x, note: e.target.value } : x)))}
                />
                <button
                  className="x"
                  aria-label="Remove this amount"
                  onClick={() => setRows(pool.id, (list) => (list.length > 1 ? list.filter((x) => x.key !== r.key) : [row()]))}
                >
                  ×
                </button>
                {errors.has(r.key) && <span className="rowerr">{errors.get(r.key)}</span>}
              </div>
            ))}
            <div className="poolfoot">
              <button
                className="link"
                onClick={() => {
                  const next = row();
                  focusKey.current = next.key;
                  setRows(pool.id, (list) => [...list, next]);
                }}
              >
                + Add amount
              </button>
              {pool.foreign && typed !== 0 && (
                <span className="small">
                  {formatMoney(typed)} {pool.foreign.currency} = {formatMoney(toTripCents(pool, typed, date))} {trip.currency}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div className="totalrow">
        <span>{multi ? `Total, all pools${anyForeign ? ` in ${trip.currency}` : ''}` : 'Total'}</span>
        <b>
          {formatMoney(total)} {trip.currency}
        </b>
      </div>
      {spentBy !== undefined && trip.method !== 'runningTotal' && (
        <div className="totalrow sub">
          <span>Spent by this day</span>
          <span>
            {formatMoney(spentBy)} {trip.currency}
          </span>
        </div>
      )}
      <Warnings items={warnings} />
      <Problems items={problems} />
      {anyForeign && (
        <p className="small hint">
          {trip.method === 'moneyLeft'
            ? 'After a cash withdrawal, update both pools and add the withdrawal as an exchange rate.'
            : 'Cash withdrawals aren’t spending: enter what you spend from the cash, not the withdrawal itself.'}
        </p>
      )}
      <button className="btn mt" onClick={save}>
        {savedEntry ? 'Save changes' : 'Save'}
      </button>
      {saved && <p className="ok center">Saved ✓</p>}
    </div>
  );
});
