import { formatMoney } from '../domain/money';
import { spendSeries } from '../domain/stats';
import type { TripRecord } from '../domain/types';
import { isAutomatic, isEditedSince } from '../domain/versions';
import { ConfirmButton, Header } from './common';
import { formatDateTime, plural, versionLabel } from './format';

export function VersionsView({
  record,
  onBack,
  onSwitch,
  onDelete,
}: {
  record: TripRecord;
  onBack: () => void;
  onSwitch: (versionId: string) => void;
  onDelete: (versionId: string) => void;
}) {
  const edited = isEditedSince(record);
  const cur = record.trip.currency;
  return (
    <>
      <Header title="Versions" sub={record.trip.name} onBack={onBack} />
      <main className="shell">
        <div className="card small">
          A version is saved whenever you export or import a trip file, and automatically before you delete or edit a saved
          day, change trip settings, or switch versions. Switching never loses anything: if the trip has changed since its
          last version, that state is saved first.
        </div>
        {edited && (
          <div className="card info">
            <b>Unsaved changes</b>
            <p className="small">The trip has changed since its last version. Switching to another version saves it first.</p>
          </div>
        )}
        {[...record.versions].reverse().map((v) => {
          const isCurrent = v.id === record.currentVersionId && !edited;
          const last = spendSeries(v.trip).at(-1);
          return (
            <div key={v.id} className={'card version' + (isAutomatic(v.kind) ? ' auto' : '') + (isCurrent ? ' current' : '')}>
              <div className="vhead">
                <b>{versionLabel(v)}</b>
                {isCurrent && <span className="badge on">Current</span>}
              </div>
              <div className="small">
                {formatDateTime(v.at)} · {plural(v.trip.entries.length, 'day')} recorded
                {last && ` · ${formatMoney(last.spent, 0)} ${cur} spent`}
              </div>
              <div className="rowbtns mt">
                {!isCurrent && (
                  <button className="ghost" onClick={() => onSwitch(v.id)}>
                    Switch to this
                  </button>
                )}
                <ConfirmButton label="Delete" confirmLabel="Delete version?" onConfirm={() => onDelete(v.id)} />
              </div>
            </div>
          );
        })}
      </main>
    </>
  );
}
