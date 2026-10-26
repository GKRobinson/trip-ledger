import {
  parseRecord,
  parseSettings,
  serializeRecord,
  serializeSettings,
} from '../domain/file-format';
import type { AppSettings, TripRecord } from '../domain/types';

/**
 * The only thing each platform implements: named text files, one per key.
 * Keys are lowercase letters, digits and dashes. `write` must be atomic — a
 * crash mid-write leaves either the old text or the new, never half of each.
 *
 * - Desktop (Electron): a .json file per key in the app's data folder.
 * - Android (Capacitor): a .json file per key in the app's private storage.
 * - Browser (development only): localStorage.
 */
export interface TextStore {
  list(): Promise<string[]>;
  read(key: string): Promise<string | null>;
  write(key: string, text: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const SETTINGS_KEY = 'settings';
const UNREADABLE_SETTINGS_KEY = 'settings-unreadable';
const TRIP_PREFIX = 'trip-';

export interface UnreadableTrip {
  key: string;
  error: string;
}

export interface LoadedSettings {
  settings: AppSettings;
  /** Set when the settings file was unreadable and had to be replaced. */
  notice: string | null;
}

/** One trip per stored file: its current state and all its versions. */
export class Repository {
  constructor(
    private readonly store: TextStore,
    private readonly newId: () => string,
  ) {}

  async loadSettings(): Promise<LoadedSettings> {
    const text = await this.store.read(SETTINGS_KEY);
    if (text !== null) {
      const parsed = parseSettings(text);
      if (parsed.ok) return { settings: parsed.value, notice: null };
      // Keep the unreadable file for inspection rather than overwrite it.
      await this.store.write(UNREADABLE_SETTINGS_KEY, text);
    }
    const settings: AppSettings = { installId: this.newId(), userName: '' };
    await this.saveSettings(settings);
    return {
      settings,
      notice:
        text === null
          ? null
          : 'Your settings file couldn’t be read, so it was reset. Trips you were editing now show as read-only — use “Start editing” on each one.',
    };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.store.write(SETTINGS_KEY, serializeSettings(settings));
  }

  /** Every stored trip. Unreadable files are reported and left untouched. */
  async loadTrips(): Promise<{ records: TripRecord[]; unreadable: UnreadableTrip[] }> {
    const records: TripRecord[] = [];
    const unreadable: UnreadableTrip[] = [];
    for (const key of await this.store.list()) {
      if (!key.startsWith(TRIP_PREFIX)) continue;
      const text = await this.store.read(key);
      if (text === null) continue;
      const parsed = parseRecord(text);
      if (parsed.ok && key === TRIP_PREFIX + parsed.value.trip.id) records.push(parsed.value);
      else unreadable.push({ key, error: parsed.ok ? 'The file name doesn’t match the trip inside it.' : parsed.error });
    }
    return { records, unreadable };
  }

  async saveTrip(record: TripRecord): Promise<void> {
    await this.store.write(TRIP_PREFIX + record.trip.id, serializeRecord(record));
  }

  async deleteTrip(tripId: string): Promise<void> {
    await this.store.remove(TRIP_PREFIX + tripId);
  }
}

/** Kept in memory only; for tests. */
export class MemoryStore implements TextStore {
  readonly files = new Map<string, string>();
  async list() {
    return [...this.files.keys()];
  }
  async read(key: string) {
    return this.files.get(key) ?? null;
  }
  async write(key: string, text: string) {
    this.files.set(key, text);
  }
  async remove(key: string) {
    this.files.delete(key);
  }
}
