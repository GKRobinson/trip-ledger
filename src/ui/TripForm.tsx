import { useState } from 'react';
import { addDays, isIsoDate, tripLength } from '../domain/dates';
import { newId } from '../domain/ids';
import { centsToInput, parseAmount } from '../domain/money';
import { LIMITS, settingsProblems, type TripSettingsInput } from '../domain/trip-ops';
import { rateText } from '../domain/currency';
import { METHODS, type Method, type Pool, type Rate, type Trip } from '../domain/types';
import { ConfirmButton, Header, Problems } from './common';
import { METHOD_INFO, plural } from './format';

/** A pool as edited in the form. A pool with a currency but no rates yet gets its first rate here. */
interface PoolDraft {
  id: string;
  name: string;
  /** '' means the trip's own currency. */
  currency: string;
  rates: Rate[];
  firstPaid: string;
  firstGot: string;
}

const blankDraft = (): PoolDraft => ({ id: newId(), name: '', currency: '', rates: [], firstPaid: '', firstGot: '' });

const draftOf = (p: Pool): PoolDraft => ({
  ...blankDraft(),
  id: p.id,
  name: p.name,
  currency: p.foreign?.currency ?? '',
  rates: p.foreign?.rates ?? [],
});

/** Blank, or the trip's own currency with no rates, means a home-currency pool. */
const isForeign = (d: PoolDraft, tripCurrency: string) => {
  const cur = d.currency.trim().toUpperCase();
  return cur !== '' && (cur !== tripCurrency || d.rates.length > 0);
};

function toPool(d: PoolDraft, tripCurrency: string, startDate: string, errors: string[]): Pool {
  if (!isForeign(d, tripCurrency)) return { id: d.id, name: d.name, foreign: null };
  let rates = d.rates;
  if (!rates.length && (d.firstPaid.trim() || d.firstGot.trim())) {
    const paid = parseAmount(d.firstPaid);
    const got = parseAmount(d.firstGot);
    if (paid.ok && got.ok) rates = [{ id: newId(), date: startDate, paid: paid.cents, got: got.cents, note: '' }];
    else errors.push(`“${d.name.trim() || 'A pool'}” rate: ${paid.ok ? (got.ok ? '' : got.error) : paid.error}`);
  }
  return { id: d.id, name: d.name, foreign: { currency: d.currency, rates } };
}

/** New trip, or the settings of an existing one. */
export function TripForm({
  existing,
  today,
  onSave,
  onCancel,
  onDelete,
}: {
  existing: Trip | null;
  today: string;
  onSave: (input: TripSettingsInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? today);
  const [endDate, setEndDate] = useState(existing?.endDate ?? addDays(today, 13));
  const [currency, setCurrency] = useState(existing?.currency ?? 'USD');
  const [budgetText, setBudgetText] = useState(existing ? centsToInput(existing.startingBudget) : '');
  const [method, setMethod] = useState<Method>(existing?.method ?? 'runningTotal');
  const [pools, setPools] = useState<PoolDraft[]>(() =>
    existing ? existing.pools.map(draftOf) : [{ ...blankDraft(), name: 'Main' }],
  );
  const [problems, setProblems] = useState<string[]>([]);

  const methodLocked = !!existing && existing.entries.length > 0;
  const days = isIsoDate(startDate) && isIsoDate(endDate) && endDate >= startDate ? tripLength(startDate, endDate) : null;
  const tripCurrency = currency.trim().toUpperCase();
  const updatePool = (id: string, change: Partial<PoolDraft>) => setPools(pools.map((p) => (p.id === id ? { ...p, ...change } : p)));

  function save() {
    const budget = parseAmount(budgetText);
    const rateErrors: string[] = [];
    const built = pools.map((d) => toPool(d, tripCurrency, startDate, rateErrors));
    const input: TripSettingsInput = {
      name,
      currency,
      startDate,
      endDate,
      method,
      startingBudget: budget.ok ? budget.cents : 0,
      pools: built,
    };
    let found = [...rateErrors, ...settingsProblems(input, existing ?? undefined)];
    if (!budget.ok && budgetText.trim()) {
      found = [`Budget: ${budget.error}`, ...found.filter((p) => p !== 'Enter a budget above zero.')];
    }
    setProblems([...new Set(found)]);
    if (!found.length) onSave(input);
  }

  return (
    <>
      <Header title={existing ? 'Trip settings' : 'New trip'} sub={existing?.name} onBack={onCancel} />
      <main className="shell">
        <div className="card">
          <label className="field">
            <span className="label">Trip name</span>
            <input value={name} maxLength={LIMITS.nameLength} placeholder="e.g. Japan 2026" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid2 tight dates">
            <label className="field">
              <span className="label">Start date</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">End date</span>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <p className="small">{days ? `${days} day${days === 1 ? '' : 's'}, counting both dates.` : 'Choose both dates.'}</p>
          <div className="grid2 tight">
            <label className="field">
              <span className="label">{existing ? 'Starting budget' : 'Budget'}</span>
              <input inputMode="decimal" value={budgetText} placeholder="e.g. 12000" onChange={(e) => setBudgetText(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Home currency</span>
              <input value={currency} maxLength={LIMITS.currencyLength} placeholder="e.g. AUD" onChange={(e) => setCurrency(e.target.value)} />
            </label>
          </div>
          {existing && (
            <p className="small">
              To add money partway through, use “Add or remove money” on the trip. Change the starting budget here only to fix a mistake.
            </p>
          )}
        </div>

        <div className="card">
          <span className="label">How do you want to record spending?</span>
          {METHODS.map((m) => (
            <label key={m} className={'choice' + (method === m ? ' on' : '') + (methodLocked ? ' locked' : '')}>
              <input type="radio" name="method" checked={method === m} disabled={methodLocked} onChange={() => setMethod(m)} />
              <span>
                <b>{METHOD_INFO[m].title}</b>
                <span className="small block">{METHOD_INFO[m].summary}</span>
                <span className="small block mute">{METHOD_INFO[m].example}</span>
              </span>
            </label>
          ))}
          {methodLocked && <p className="small">Locked: this trip already has entries.</p>}
        </div>

        <div className="card">
          <span className="label">Pools</span>
          <p className="small">
            Where your money sits: cash, a card, a travel card. Pools add up to one budget, and each day’s form gets a section per pool.
            Most trips need just one.
          </p>
          <p className="small">
            Leave a pool’s currency blank for {tripCurrency || 'the home currency'}: card payments, as your bank feed shows them. Give
            local cash its own currency, e.g. JPY.
          </p>
          <div className="poolrow head small">
            <span>Name</span>
            <span>Currency</span>
          </div>
          {pools.map((pool, i) => {
            const foreign = isForeign(pool, tripCurrency);
            const cur = pool.currency.trim().toUpperCase();
            const latest = pool.rates.at(-1);
            return (
              <div key={pool.id} className="poolblock">
                <div className="poolrow">
                  <input
                    value={pool.name}
                    maxLength={LIMITS.poolNameLength}
                    aria-label={`Pool ${i + 1} name`}
                    onChange={(e) => updatePool(pool.id, { name: e.target.value })}
                  />
                  <input
                    className="cur"
                    value={pool.currency}
                    maxLength={LIMITS.currencyLength}
                    placeholder={tripCurrency}
                    aria-label={`Pool ${i + 1} currency`}
                    onChange={(e) => updatePool(pool.id, { currency: e.target.value })}
                  />
                  <button
                    className="x"
                    aria-label={`Remove ${pool.name || 'pool'}`}
                    disabled={pools.length === 1}
                    onClick={() => setPools(pools.filter((p) => p.id !== pool.id))}
                  >
                    ×
                  </button>
                </div>
                {foreign && !latest && (
                  <div className="firstrate">
                    <div className="raterow">
                      <span className="small">Paid</span>
                      <input
                        inputMode="decimal"
                        value={pool.firstPaid}
                        placeholder={tripCurrency}
                        aria-label={`What you paid in ${tripCurrency}`}
                        onChange={(e) => updatePool(pool.id, { firstPaid: e.target.value })}
                      />
                      <span className="small">for</span>
                      <input
                        inputMode="decimal"
                        value={pool.firstGot}
                        placeholder={cur}
                        aria-label={`What you got in ${cur}`}
                        onChange={(e) => updatePool(pool.id, { firstGot: e.target.value })}
                      />
                    </div>
                    <p className="small">
                      The rate: what a cash withdrawal cost on your bank feed, and the {cur} you got. Fees included, so it’s your real
                      rate. Add newer rates on the trip screen.
                    </p>
                  </div>
                )}
                {foreign && latest && (
                  <p className="small">
                    {plural(pool.rates.length, 'rate')}, latest {rateText(latest, cur, tripCurrency)}. Add or remove rates on the trip
                    screen.
                  </p>
                )}
              </div>
            );
          })}
          {pools.length < LIMITS.maxPools && (
            <button className="link" onClick={() => setPools([...pools, blankDraft()])}>
              + Add pool
            </button>
          )}
        </div>

        <Problems items={problems} />
        <div className="stack">
          <button className="btn" onClick={save}>
            {existing ? 'Save settings' : 'Create trip'}
          </button>
          <button className="ghost wide" onClick={onCancel}>
            Cancel
          </button>
        </div>

        {existing && onDelete && (
          <div className="card danger">
            <span className="label">Delete trip</span>
            <p className="small">
              Removes this trip and all its versions from this device. Export it first if you might want it back.
            </p>
            <ConfirmButton label="Delete this trip" confirmLabel="Tap again to delete" onConfirm={onDelete} className="ghost red wide" />
          </div>
        )}
      </main>
    </>
  );
}
