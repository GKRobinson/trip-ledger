import { useRef, useState } from 'react';
import { clampDate, dayNumber, formatDate, isIsoDate, tripLength } from '../domain/dates';
import { newId } from '../domain/ids';
import { formatMoney, parseAmount } from '../domain/money';
import { entryTotal, spendSeries, tripStats, type SpendPoint, type TripStats } from '../domain/stats';
import { LIMITS, budgetChangeProblems, isEditable } from '../domain/trip-ops';
import type { BudgetChange, DayEntry, Trip, TripRecord } from '../domain/types';
import { ConfirmButton, Header, Problems } from './common';
import { EntryForm } from './EntryForm';
import { dateRange, plural, signedMoney, timeAgo, tripPhase, formatDateTime } from './format';

export interface TripActions {
  saveEntry: (entry: DayEntry, existed: boolean) => Promise<boolean>;
  deleteEntry: (date: string) => void;
  addBudgetChange: (change: BudgetChange) => Promise<boolean>;
  deleteBudgetChange: (change: BudgetChange) => void;
  exportTrip: () => void;
  startEditing: () => void;
  openVersions: () => void;
  openSettings: () => void;
}

export function TripView({
  record,
  installId,
  today,
  onBack,
  actions,
}: {
  record: TripRecord;
  installId: string;
  today: string;
  onBack: () => void;
  actions: TripActions;
}) {
  const trip = record.trip;
  const editable = isEditable(trip, installId);
  const stats = tripStats(trip);
  const series = spendSeries(trip);
  const [formDate, setFormDate] = useState(() => clampDate(today, trip.startDate, trip.endDate));
  const formRef = useRef<HTMLDivElement>(null);

  const editDate = (date: string) => {
    setFormDate(date);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Header
        title={trip.name}
        sub={`${dateRange(trip)} · ${plural(stats.tripDays, 'day')}`}
        onBack={onBack}
        right={
          editable && (
            <button className="ghost onhead" onClick={actions.openSettings}>
              Edit trip
            </button>
          )
        }
      />
      <main className="shell">
        {!editable && <ReadOnlyBanner trip={trip} onStartEditing={actions.startEditing} />}
        <Summary trip={trip} stats={stats} today={today} />
        {editable && (
          <EntryForm ref={formRef} trip={trip} date={formDate} today={today} onDateChange={setFormDate} onSave={actions.saveEntry} />
        )}
        {series.length > 0 && <Chart trip={trip} series={series} />}
        {editable && <BudgetChangeForm trip={trip} today={today} onAdd={actions.addBudgetChange} />}
        <Timeline trip={trip} series={series} stats={stats} editable={editable} onEdit={editDate} actions={actions} />
        <div className="card">
          <span className="label">Share and history</span>
          <div className="stack">
            <button className="btn" onClick={actions.exportTrip}>
              Export trip file
            </button>
            <button className="ghost wide" onClick={actions.openVersions}>
              Versions ({record.versions.length})
            </button>
          </div>
          <p className="small">
            Send the file to anyone with Trip Ledger. If they already have this trip, importing it replaces their copy.
          </p>
        </div>
      </main>
    </>
  );
}

function ReadOnlyBanner({ trip, onStartEditing }: { trip: Trip; onStartEditing: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="card readonly">
      <b>{trip.updatedBy || 'Someone else'}’s trip · read-only</b>
      <p className="small">
        Updated {formatDateTime(trip.updatedAt)} ({timeAgo(trip.updatedAt)}). Import their newer files to stay up to date.
      </p>
      {!asking ? (
        <button className="ghost" onClick={() => setAsking(true)}>
          Start editing
        </button>
      ) : (
        <>
          <p className="small">
            You’ll become this trip’s editor. Files you export will make you the editor for whoever imports them. If{' '}
            {trip.updatedBy || 'they'} send{trip.updatedBy ? 's' : ''} another file later, importing it hands editing back.
          </p>
          <div className="rowbtns">
            <button className="btn" onClick={onStartEditing}>
              Start editing
            </button>
            <button className="ghost" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Summary({ trip, stats, today }: { trip: Trip; stats: TripStats; today: string }) {
  const cur = trip.currency;
  const phase = tripPhase(trip, today);
  const last = stats.last;
  const over = (stats.paceDelta ?? 0) > 0;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / stats.budget) * 100));
  return (
    <>
      <div className="card center summary">
        <span className="label">Left to spend per day</span>
        <div className={'bignum' + (stats.perDayLeft < 0 ? ' neg' : '')}>{formatMoney(stats.perDayLeft, 0)}</div>
        <div className="small">
          {last
            ? stats.daysLeft > 0
              ? `${cur} · ${formatMoney(stats.remaining, 0)} left over ${plural(stats.daysLeft, 'day')} after ${formatDate(last.date)}`
              : `${cur} · ${formatMoney(stats.remaining, 0)} left · last day recorded`
            : `${cur} · ${formatMoney(stats.budget, 0)} over ${plural(stats.tripDays, 'day')} · nothing recorded yet`}
        </div>
        <div className="phase small">
          {phase.kind === 'upcoming' && `Starts in ${plural(phase.inDays, 'day')}`}
          {phase.kind === 'active' && `Today is day ${dayNumber(trip.startDate, today)} of ${stats.tripDays}`}
          {phase.kind === 'ended' && `Trip ended ${formatDate(trip.endDate, true)}`}
        </div>
        {last && stats.paceDelta !== null && (
          <div className="gaugewrap">
            <div className="gauge">
              <div className="gfill" style={{ width: `${pct(stats.spent)}%`, background: over ? 'var(--red)' : 'var(--green)' }} />
              <div className="gtick" style={{ left: `calc(${pct(stats.spent - stats.paceDelta)}% - 1.5px)` }} />
            </div>
            <div className="grow">
              <span>{formatMoney(stats.spent, 0)} spent</span>
              <span style={{ color: over ? 'var(--red)' : 'var(--green)' }}>
                {formatMoney(Math.abs(stats.paceDelta), 0)} {over ? 'over' : 'under'} pace
              </span>
            </div>
          </div>
        )}
      </div>
      {last && (
        <div className="grid2">
          <Stat label="Total spent" value={`${formatMoney(stats.spent, 0)} ${cur}`} />
          <Stat label="Remaining" value={`${formatMoney(stats.remaining, 0)} ${cur}`} />
          <Stat label="Daily average so far" value={`${formatMoney(stats.averagePerDay ?? 0, 0)} ${cur}`} />
          <Stat label="Even-pace target" value={`${formatMoney(stats.evenPacePerDay, 0)} ${cur}/day`} />
        </div>
      )}
      <div className="small budgetline">
        Budget {formatMoney(stats.budget)} {cur}
        {stats.budgetAdded !== 0 && ` · ${formatMoney(trip.startingBudget)} to start, ${signedMoney(stats.budgetAdded)} since`}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <b>{value}</b>
    </div>
  );
}

/** Spend vs even pace vs budget, drawn as plain SVG. */
function Chart({ trip, series }: { trip: Trip; series: SpendPoint[] }) {
  const tripDays = tripLength(trip.startDate, trip.endDate);
  // Budget as a step line: each change applies from the start of its day.
  let budget = trip.startingBudget;
  const budgetPts: Array<[number, number]> = [[0, budget]];
  for (const c of trip.budgetChanges) {
    const at = dayNumber(trip.startDate, c.date) - 1;
    budgetPts.push([at, budget]);
    budget += c.cents;
    budgetPts.push([at, budget]);
  }
  budgetPts.push([tripDays, budget]);
  const spentPts: Array<[number, number]> = [[0, 0], ...series.map((p): [number, number] => [p.day, p.spent])];

  const W = 100;
  const pad = 4;
  const plotH = 50;
  const values = [...budgetPts.map((p) => p[1]), ...spentPts.map((p) => p[1])];
  const maxY = Math.max(...values, 1) * 1.05;
  const minY = Math.min(0, ...values);
  const x = (d: number) => pad + (d / tripDays) * (W - 2 * pad);
  const y = (v: number) => pad + plotH - ((v - minY) / (maxY - minY)) * plotH;
  const pts = (list: Array<[number, number]>) => list.map(([d, v]) => `${x(d).toFixed(2)},${y(v).toFixed(2)}`).join(' ');

  return (
    <div className="card">
      <span className="label">Spend vs even pace</span>
      <svg viewBox="0 0 100 62" className="chart" role="img" aria-label="Chart of spending against an even pace and the budget">
        <polyline points={pts(budgetPts)} fill="none" stroke="var(--red)" strokeWidth="0.6" strokeDasharray="2,1.5" />
        <polyline points={pts([[0, 0], [tripDays, budget]])} fill="none" stroke="var(--yellow)" strokeWidth="1" />
        <polyline points={pts(spentPts)} fill="none" stroke="var(--green)" strokeWidth="1.3" />
        {series.map((p) => (
          <circle key={p.date} cx={x(p.day).toFixed(2)} cy={y(p.spent).toFixed(2)} r="1.1" fill="var(--green)" />
        ))}
        <text x={pad} y="61">
          {formatDate(trip.startDate)}
        </text>
        <text x={W - pad} y="61" textAnchor="end">
          {formatDate(trip.endDate)}
        </text>
      </svg>
      <div className="small">Green: your spending · Yellow: even pace · Dashed red: budget</div>
    </div>
  );
}

function BudgetChangeForm({ trip, today, onAdd }: { trip: Trip; today: string; onAdd: (c: BudgetChange) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => clampDate(today, trip.startDate, trip.endDate));
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  if (!open) {
    return (
      <button className="ghost wide cardgap" onClick={() => setOpen(true)}>
        Add or remove money
      </button>
    );
  }

  async function save() {
    const parsed = parseAmount(amount);
    const change: BudgetChange = { id: newId(), date, cents: parsed.ok ? Math.abs(parsed.cents) * direction : 0, note };
    const found = parsed.ok ? budgetChangeProblems(trip, change) : [parsed.error];
    if (!isIsoDate(date)) found.unshift('Choose a date.');
    setProblems([...new Set(found)]);
    if (found.length) return;
    if (await onAdd(change)) {
      setOpen(false);
      setAmount('');
      setNote('');
      setProblems([]);
    }
  }

  return (
    <div className="card">
      <span className="label">Add or remove money</span>
      <div className="segmented">
        <button className={direction === 1 ? 'on' : ''} onClick={() => setDirection(1)}>
          Add money
        </button>
        <button className={direction === -1 ? 'on' : ''} onClick={() => setDirection(-1)}>
          Remove money
        </button>
      </div>
      <div className="grid2 tight">
        <label className="field">
          <span className="label">Amount</span>
          <input inputMode="decimal" value={amount} placeholder="e.g. 500" onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">From date</span>
          <input type="date" value={date} min={trip.startDate} max={trip.endDate} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="label">Note</span>
        <input value={note} maxLength={LIMITS.noteLength} placeholder="e.g. Birthday money" onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="small">
        Changes the budget from this date on. Days before it keep the budget they had, so their spending stays right.
      </p>
      <Problems items={problems} />
      <div className="rowbtns">
        <button className="btn" onClick={save}>
          Save
        </button>
        <button className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type TimelineItem =
  | { kind: 'entry'; date: string; entry: DayEntry; point: SpendPoint }
  | { kind: 'change'; date: string; change: BudgetChange }
  | { kind: 'missing'; date: string };

function Timeline({
  trip,
  series,
  stats,
  editable,
  onEdit,
  actions,
}: {
  trip: Trip;
  series: SpendPoint[];
  stats: TripStats;
  editable: boolean;
  onEdit: (date: string) => void;
  actions: TripActions;
}) {
  const items: TimelineItem[] = [
    ...trip.entries.map((entry, i): TimelineItem => ({ kind: 'entry', date: entry.date, entry, point: series[i]! })),
    ...trip.budgetChanges.map((change): TimelineItem => ({ kind: 'change', date: change.date, change })),
    ...stats.missingDates.map((date): TimelineItem => ({ kind: 'missing', date })),
  ];
  const order = { change: 0, entry: 1, missing: 1 };
  items.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : order[a.kind] - order[b.kind]));
  if (!items.length) return null;
  const cur = trip.currency;
  const multi = trip.pools.length > 1;

  return (
    <div className="card">
      <span className="label">Updates</span>
      {items.map((item) => {
        const day = dayNumber(trip.startDate, item.date);
        if (item.kind === 'change') {
          const c = item.change;
          return (
            <div key={c.id} className="entry">
              <div className="entry-main">
                <div>
                  <span className="daytag money">BUDGET</span>
                  <span className="small">{formatDate(c.date)}</span>
                </div>
                <b>
                  {signedMoney(c.cents)} {cur}
                </b>
                {c.note && <span className="small"> · {c.note}</span>}
              </div>
              {editable && (
                <div className="rowbtns">
                  <ConfirmButton label="Delete" confirmLabel="Delete?" onConfirm={() => actions.deleteBudgetChange(c)} />
                </div>
              )}
            </div>
          );
        }
        if (item.kind === 'missing') {
          return (
            <div key={`missing-${item.date}`} className="entry missing">
              <div className="entry-main">
                <div>
                  <span className="daytag">DAY {day}</span>
                  <span className="small">{formatDate(item.date)}</span>
                </div>
                <span className="small">No entry · counts as nothing spent</span>
              </div>
              {editable && (
                <div className="rowbtns">
                  <button className="ghost" onClick={() => onEdit(item.date)}>
                    Add
                  </button>
                </div>
              )}
            </div>
          );
        }
        const { entry, point } = item;
        const total = entryTotal(entry);
        const all = Object.values(entry.amounts).flat();
        const decimals = all.some((a) => a.cents % 100 !== 0) ? 2 : 0; // "44.00 + 99.50", not "44 + 99.50"
        const parts = trip.pools
          .filter((p) => (entry.amounts[p.id] ?? []).length)
          .map((p) => {
            const list = (entry.amounts[p.id] ?? [])
              .map((a) => `${formatMoney(a.cents, decimals)}${a.note ? ` ${a.note}` : ''}`)
              .join(' + ');
            return multi ? `${p.name}: ${list}` : list;
          });
        const showBreakdown = multi || all.length > 1 || all.some((a) => a.note);
        return (
          <div key={entry.date} className="entry">
            <div className="entry-main">
              <div>
                <span className="daytag">DAY {day}</span>
                <span className="small">{formatDate(entry.date)}</span>
              </div>
              <b>
                {formatMoney(total)} {cur}
              </b>
              <span className="small">
                {trip.method === 'runningTotal' && ' spent so far'}
                {trip.method === 'moneyLeft' && ` left · ${formatMoney(point.spent)} spent`}
                {trip.method === 'dailySpend' && ` spent · ${formatMoney(point.spent)} so far`}
              </span>
              {showBreakdown && <div className="small breakdown">{parts.join(' · ')}</div>}
            </div>
            {editable && (
              <div className="rowbtns">
                <button className="ghost" onClick={() => onEdit(entry.date)}>
                  Edit
                </button>
                <ConfirmButton label="Delete" confirmLabel="Delete?" onConfirm={() => actions.deleteEntry(entry.date)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
