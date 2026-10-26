import { formatDate } from '../domain/dates';
import type { ImportPreview } from '../domain/import';
import { formatMoney } from '../domain/money';
import { tripStats } from '../domain/stats';
import { Header } from './common';
import { dateRange, formatDateTime, plural, signedMoney } from './format';

const dates = (list: string[]) => list.map((d) => formatDate(d)).join(', ');

export function ImportView({
  preview,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { file, existing } = preview;
  const trip = file.trip;
  const from = file.exportedBy || 'someone';
  const stats = tripStats(trip);

  return (
    <>
      <Header title="Import trip file" sub={trip.name} onBack={onCancel} />
      <main className="shell">
        <div className="card">
          <b className="tripname">{trip.name}</b>
          <p className="small">
            {dateRange(trip)} · {plural(stats.tripDays, 'day')} · {plural(trip.entries.length, 'day')} recorded ·{' '}
            {formatMoney(stats.spent, 0)} {trip.currency} spent
          </p>
          <p className="small">
            Exported by {from} on {formatDateTime(file.exportedAt)}. Last changed {formatDateTime(trip.updatedAt)}
            {trip.updatedBy ? ` by ${trip.updatedBy}` : ''}.
          </p>
        </div>

        {!existing && (
          <div className="card">
            <b>New trip</b>
            <p className="small">
              You don’t have this trip yet, so it will be added.{' '}
              {preview.editableAfter
                ? 'You’re its editor.'
                : `It will be read-only: it’s ${file.exportedBy ? `${file.exportedBy}’s` : 'someone else’s'} trip. You can choose “Start editing” later if you take over.`}
            </p>
          </div>
        )}

        {existing && preview.identical && (
          <div className="card info">
            <b>Nothing to update</b>
            <p className="small">This file matches your copy exactly.</p>
          </div>
        )}

        {existing && !preview.identical && (
          <>
            {preview.fileIsOlder && (
              <div className="card warn">
                <b>This file is older than your copy.</b>
                <p className="small">
                  Your copy was last changed {formatDateTime(existing.updatedAt)}; the file’s trip was last changed{' '}
                  {formatDateTime(trip.updatedAt)}.
                </p>
              </div>
            )}
            <div className="card">
              <b>Replacing your copy will:</b>
              <ul className="changes">
                {preview.addedDays.length > 0 && <li className="good">Add {dates(preview.addedDays)}</li>}
                {preview.changedDays.length > 0 && <li>Change {dates(preview.changedDays)}</li>}
                {preview.removedDays.length > 0 && <li className="bad">Remove {dates(preview.removedDays)} — days only your copy has</li>}
                {preview.addedBudgetChanges.map((c) => (
                  <li key={`a-${c.id}`} className="good">
                    Add budget change {signedMoney(c.cents)} on {formatDate(c.date)}
                    {c.note && ` (${c.note})`}
                  </li>
                ))}
                {preview.removedBudgetChanges.map((c) => (
                  <li key={`r-${c.id}`} className="bad">
                    Remove budget change {signedMoney(c.cents)} on {formatDate(c.date)}
                    {c.note && ` (${c.note})`}
                  </li>
                ))}
                {preview.fieldChanges.map((f) => (
                  <li key={f.label}>
                    {f.label}: {f.from} → {f.to}
                  </li>
                ))}
                {preview.addedDays.length + preview.changedDays.length + preview.removedDays.length === 0 &&
                  preview.addedBudgetChanges.length + preview.removedBudgetChanges.length + preview.fieldChanges.length === 0 && (
                    <li>Update who changed it last and when</li>
                  )}
              </ul>
            </div>
            {preview.youStopEditing && (
              <div className="card warn">
                <b>You’re this trip’s editor now.</b>
                <p className="small">
                  After replacing, {file.exportedBy || 'the sender'} will be the editor and your copy becomes read-only.
                </p>
              </div>
            )}
            <p className="small center">Your current copy is saved as a version first, so you can switch back.</p>
          </>
        )}

        <div className="stack">
          {!(existing && preview.identical) && (
            <button className="btn" onClick={onConfirm}>
              {existing ? 'Replace my copy' : 'Add trip'}
            </button>
          )}
          <button className="ghost wide" onClick={onCancel}>
            {existing && preview.identical ? 'Back' : 'Cancel'}
          </button>
        </div>
      </main>
    </>
  );
}
