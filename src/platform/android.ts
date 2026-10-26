import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { TextStore } from '../storage/repository';
import type { Platform } from './platform';

/** App-private storage: other apps can't read it; uninstalling removes it. */
const DIR = 'trip-ledger';
const dataFile = (name: string) => ({ path: `${DIR}/${name}`, directory: Directory.Data });

async function exists(name: string): Promise<boolean> {
  try {
    await Filesystem.stat(dataFile(name));
    return true;
  } catch {
    return false;
  }
}

async function readText(name: string): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({ ...dataFile(name), encoding: Encoding.UTF8 });
    return typeof data === 'string' ? data : await data.text();
  } catch (e) {
    if (!(await exists(name))) return null;
    throw e;
  }
}

/**
 * One .json file per key. Writes go to "<key>.json.tmp" first and are then
 * renamed into place, so a crash mid-write never leaves half a file. If the
 * rename can't replace the old file, the old one is removed first; a read
 * that finds only the .tmp (a crash between those two steps) uses it.
 */
const store: TextStore = {
  async list() {
    let files: string[];
    try {
      files = (await Filesystem.readdir({ path: DIR, directory: Directory.Data })).files.map((f) => f.name);
    } catch {
      return [];
    }
    const keys = new Set<string>();
    for (const f of files) {
      if (f.endsWith('.json')) keys.add(f.slice(0, -5));
      else if (f.endsWith('.json.tmp') && !files.includes(f.slice(0, -4))) keys.add(f.slice(0, -9));
    }
    return [...keys];
  },
  async read(key) {
    return (await readText(`${key}.json`)) ?? (await readText(`${key}.json.tmp`));
  },
  async write(key, text) {
    const tmp = `${key}.json.tmp`;
    await Filesystem.writeFile({ ...dataFile(tmp), data: text, encoding: Encoding.UTF8, recursive: true });
    const rename = () => Filesystem.rename({ from: `${DIR}/${tmp}`, to: `${DIR}/${key}.json`, directory: Directory.Data });
    try {
      await rename();
    } catch {
      if (await exists(`${key}.json`)) await Filesystem.deleteFile(dataFile(`${key}.json`));
      await rename();
    }
  },
  async remove(key) {
    for (const name of [`${key}.json`, `${key}.json.tmp`]) {
      if (await exists(name)) await Filesystem.deleteFile(dataFile(name));
    }
  },
};

export function androidPlatform(): Platform {
  return {
    kind: 'android',
    store,
    async exportFile(fileName, text) {
      const path = `exports/${fileName}`;
      await Filesystem.writeFile({ path, directory: Directory.Cache, data: text, encoding: Encoding.UTF8, recursive: true });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      try {
        await Share.share({ title: fileName, files: [uri], dialogTitle: 'Send trip file' });
        return 'saved';
      } catch (e) {
        if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return 'cancelled';
        throw e;
      }
    },
    onBackButton(handler) {
      void App.addListener('backButton', handler);
    },
    exitApp() {
      void App.exitApp();
    },
  };
}
