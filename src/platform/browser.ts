import type { TextStore } from '../storage/repository';
import type { Platform } from './platform';

/**
 * For development in a browser tab only. localStorage can be cleared by the
 * browser at any time, which is exactly why the real apps use files.
 */
const PREFIX = 'trip-ledger:';

const store: TextStore = {
  async list() {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  },
  async read(key) {
    return localStorage.getItem(PREFIX + key);
  },
  async write(key, text) {
    localStorage.setItem(PREFIX + key, text);
  },
  async remove(key) {
    localStorage.removeItem(PREFIX + key);
  },
};

export function browserPlatform(): Platform {
  return {
    kind: 'browser',
    store,
    async exportFile(fileName, text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return 'saved';
    },
  };
}
