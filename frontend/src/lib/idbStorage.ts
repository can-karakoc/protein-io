// IndexedDB key-value storage for Zustand persist.
// ~50 MB capacity — handles structureText (~200 KB–2 MB per structure).

const DB_NAME = "protein-io";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => { _db = req.result; resolve(_db!); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB blocked"));
  });
}

async function idbGet(name: string): Promise<string | null> {
  try {
    const db = await openDB();
    return await new Promise<string | null>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(name);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(name: string, value: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore quota / IDB errors silently
  }
}

async function idbDelete(name: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

// Zustand PersistStorage adapter with debounced writes.
//
// createJSONStorage runs JSON.stringify synchronously on every store update —
// with structureText (~2 MB per structure) that blocks the main thread for
// every tab click, hover, and selection change. This adapter receives the
// raw JS object in setItem and only serializes + writes after `debounceMs`
// of inactivity, keeping the UI frame budget intact.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDebouncedIdbStorage<S = any>(debounceMs = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: unknown = null;

  function flush() {
    if (pendingName === null) return;
    const name = pendingName;
    const value = pendingValue;
    pendingName = null;
    pendingValue = null;
    idbSet(name, JSON.stringify(value)).catch(() => undefined);
  }

  return {
    getItem: async (name: string): Promise<{ state: S; version?: number } | null> => {
      const str = await idbGet(name);
      if (!str) return null;
      try { return JSON.parse(str) as { state: S; version?: number }; }
      catch { return null; }
    },
    setItem: (name: string, value: { state: S; version?: number }): void => {
      pendingName = name;
      pendingValue = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    },
    removeItem: async (name: string): Promise<void> => {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      pendingName = null;
      pendingValue = null;
      await idbDelete(name);
    },
  };
}
