// Persisted key-value pairs for app-level state (recents, last open repo, last clone dir).
// Backed by the store plugin (`recents.json` in app_data_dir); falls back to localStorage when the
// plugin is unavailable (vitest / plain browser).
import { load } from "@tauri-apps/plugin-store";

const FILE = "recents.json";
const LOCAL_PREFIX = "kv:";

interface Backend {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const local: Backend = {
  async get(key) {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  },
  async set(key, value) {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  },
};

let backend: Promise<Backend> | null = null;

function open(): Promise<Backend> {
  backend ??= load(FILE)
    .then<Backend>((store) => ({
      get: (key) => store.get(key),
      async set(key, value) {
        await store.set(key, value);
        await store.save();
      },
    }))
    .catch(() => local);
  return backend;
}

export const kvGet = async <T>(key: string): Promise<T | undefined> => (await open()).get<T>(key);

export const kvSet = async (key: string, value: unknown): Promise<void> => (await open()).set(key, value);
