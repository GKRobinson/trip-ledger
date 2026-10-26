import type { Platform } from './platform';

/**
 * What electron/preload.cjs exposes. The main process does the file work;
 * the page never gets Node or general file access.
 */
export interface TripLedgerNative {
  list(): Promise<string[]>;
  read(key: string): Promise<string | null>;
  write(key: string, text: string): Promise<void>;
  remove(key: string): Promise<void>;
  saveExport(fileName: string, text: string): Promise<'saved' | 'cancelled'>;
  openDataFolder(): Promise<void>;
}

declare global {
  interface Window {
    tripLedgerNative?: TripLedgerNative;
  }
}

export function desktopPlatform(native: TripLedgerNative): Platform {
  return {
    kind: 'desktop',
    store: {
      list: () => native.list(),
      read: (key) => native.read(key),
      write: (key, text) => native.write(key, text),
      remove: (key) => native.remove(key),
    },
    exportFile: (fileName, text) => native.saveExport(fileName, text),
    openDataFolder: () => native.openDataFolder(),
  };
}
