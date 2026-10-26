import { createRoot } from 'react-dom/client';
import { newId } from './domain/ids';
import { detectPlatform } from './platform/platform';
import { Repository } from './storage/repository';
import { App } from './ui/App';
import './styles.css';

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    const platform = await detectPlatform();
    const repo = new Repository(platform.store, newId);
    const { settings, notice } = await repo.loadSettings();
    const { records, unreadable } = await repo.loadTrips();
    root.render(
      <App
        platform={platform}
        repo={repo}
        initialSettings={settings}
        initialRecords={records}
        unreadable={unreadable}
        notice={notice}
      />,
    );
  } catch (e) {
    root.render(
      <main className="shell">
        <div className="card warn">
          <b>Trip Ledger couldn’t start.</b>
          <p className="small">{e instanceof Error ? e.message : String(e)}</p>
          <p className="small">Your trip files haven’t been changed.</p>
        </div>
      </main>,
    );
  }
}

void boot();
