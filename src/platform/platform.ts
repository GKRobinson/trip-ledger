import type { TextStore } from '../storage/repository';

export type ExportOutcome = 'saved' | 'cancelled';

/**
 * What differs between Windows/Linux (Electron), Android (Capacitor) and a
 * plain browser (development only). Everything else is shared.
 */
export interface Platform {
  kind: 'desktop' | 'android' | 'browser';
  store: TextStore;
  /** Desktop: a Save dialog. Android: the share sheet. Browser: a download. */
  exportFile(fileName: string, text: string): Promise<ExportOutcome>;
  /** Desktop only: show the folder the trip files live in. */
  openDataFolder?: () => Promise<void>;
  /** Android only: the system Back button. */
  onBackButton?: (handler: () => void) => void;
  exitApp?: () => void;
}

export async function detectPlatform(): Promise<Platform> {
  if (window.tripLedgerNative) return (await import('./desktop')).desktopPlatform(window.tripLedgerNative);
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) return (await import('./android')).androidPlatform();
  return (await import('./browser')).browserPlatform();
}
