import { useState } from 'react';
import { addDays, isIsoDate, tripLength } from '../domain/dates';
import { newId } from '../domain/ids';
import { centsToInput, parseAmount } from '../domain/money';
import { LIMITS, settingsProblems, type TripSettingsInput } from '../domain/trip-ops';
import { METHODS, type Method, type Pool, type Trip } from '../domain/types';
import { ConfirmButton, Header, Problems } from './common';
import { METHOD_INFO } from './format';

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
  const [pools, setPools] = useState<Pool[]>(existing?.pools ?? [{ id: newId(), name: 'Main' }]);
  const [problems, setProblems] = useState<string[]>([]);

  const methodLocked = !!existing && existing.entries.length > 0;
  const days = isIsoDate(startDate) && isIsoDate(endDate) && endDate >= startDate ? tripLength(startDate, endDate) : null;

  function save() {
    const budget = parseAmount(budgetText);
    const input: TripSettingsInput = {
      name,
      currency,
      startDate,
      endDate,
      method,
      startingBudget: budget.ok ? budget.cents : 0,
      pools,
    };
    let found = settingsProblems(input, existing ?? undefined);
    if (!budget.ok && budgetText.trim()) {
      found = [`Budget: ${budget.error}`, ...found.filter((p) => p !== 'Enter a budget above zero.')];
    }
    setProblems(found);
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
          <div className="grid2 tight">
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
              <span className="label">Currency label</span>
              <input value={currency} maxLength={LIMITS.currencyLength} onChange={(e) => setCurrency(e.target.value)} />
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
          {pools.map((pool, i) => (
            <div key={pool.id} className="poolrow">
              <input
                value={pool.name}
                maxLength={LIMITS.poolNameLength}
                aria-label={`Pool ${i + 1} name`}
                onChange={(e) => setPools(pools.map((p) => (p.id === pool.id ? { ...p, name: e.target.value } : p)))}
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
          ))}
          {pools.length < LIMITS.maxPools && (
            <button className="link" onClick={() => setPools([...pools, { id: newId(), name: '' }])}>
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
