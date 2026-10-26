import { formatMoney } from '../domain/money';
import { tripStats } from '../domain/stats';
import { isEditable } from '../domain/trip-ops';
import type { TripRecord } from '../domain/types';
import type { UnreadableTrip } from '../storage/repository';
import { Header } from './common';
import { METHOD_INFO, dateRange, tripPhase } from './format';

export function TripList({
  records,
  installId,
  today,
  unreadable,
  notice,
  onOpen,
  onNew,
  onImport,
  onSettings,
}: {
  records: TripRecord[];
  installId: string;
  today: string;
  unreadable: UnreadableTrip[];
  notice: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  onSettings: () => void;
}) {
  const trips = records
    .map((r) => r.trip)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name));

  return (
    <>
      <Header
        title="Trip Ledger"
        sub="Offline · private · kept on this device"
        right={
          <button className="ghost onhead" onClick={onSettings}>
            Settings
          </button>
        }
      />
      <main className="shell">
        {notice && <div className="card warn">{notice}</div>}
        {unreadable.length > 0 && (
          <div className="card warn">
            <b>Some saved trips couldn’t be read.</b> They’ve been left untouched.
            <ul className="small">
              {unreadable.map((u) => (
                <li key={u.key}>
                  {u.key}: {u.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {trips.length === 0 && (
          <div className="card center empty">
            <p>No trips yet.</p>
            <p className="small">Create a trip, or import a trip file someone sent you.</p>
          </div>
        )}

        {trips.map((trip) => {
          const stats = tripStats(trip);
          const phase = tripPhase(trip, today);
          const readOnly = !isEditable(trip, installId);
          return (
            <button key={trip.id} className="card tripcard" onClick={() => onOpen(trip.id)}>
              <div className="tripcard-main">
                <b className="tripname">{trip.name}</b>
                <span className="small">
                  {dateRange(trip)} · {stats.tripDays} days
                </span>
                <span className="small">
                  {METHOD_INFO[trip.method].title} · {trip.currency}
                  {phase.kind === 'upcoming' && ` · starts in ${phase.inDays} day${phase.inDays === 1 ? '' : 's'}`}
                  {phase.kind === 'ended' && ' · ended'}
                </span>
                {readOnly && <span className="badge">Read-only · from {trip.updatedBy || 'someone else'}</span>}
              </div>
              <div className="tripcard-side">
                <b className={'perday' + (stats.perDayLeft < 0 ? ' neg' : '')}>{formatMoney(stats.perDayLeft, 0)}</b>
                <span className="small">per day</span>
              </div>
            </button>
          );
        })}

        <div className="stack">
          <button className="btn" onClick={onNew}>
            New trip
          </button>
          <button className="ghost wide" onClick={onImport}>
            Import trip file
          </button>
        </div>
      </main>
    </>
  );
}
