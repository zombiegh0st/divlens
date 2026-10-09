// IndexedDB storage: transactions, prices, snapshots, settings.

const STORES = { transactions: 'id', prices: 'isin', snapshots: 'date', settings: 'key' };
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('divlens', 1);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const result = fn(t);
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const getAll = (store) => run([store], 'readonly', (t) => t.objectStore(store).getAll());
export const getAllKeys = (store) => run([store], 'readonly', (t) => t.objectStore(store).getAllKeys());
export const count = (store) => run([store], 'readonly', (t) => t.objectStore(store).count());
export const put = (store, value) => putMany(store, [value]);
export const remove = (store, key) => run([store], 'readwrite', (t) => { t.objectStore(store).delete(key); });

export function putMany(store, values) {
  return run([store], 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
  });
}

// Deletes all transactions and inserts the given ones in one atomic step.
export function replaceTransactions(values) {
  return run(['transactions'], 'readwrite', (t) => {
    const os = t.objectStore('transactions');
    os.clear();
    for (const v of values) os.put(v);
  });
}

export async function getSettings() {
  const rows = await getAll('settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export const setSetting = (key, value) => put('settings', { key, value });

export async function exportBackup() {
  const data = { app: 'divlens', version: 1, exportedAt: new Date().toISOString() };
  for (const store of Object.keys(STORES)) data[store] = await getAll(store);
  return data;
}

export function restoreBackup(data) {
  if (data?.app !== 'divlens' || !Array.isArray(data.transactions)) throw new Error('Keine gültige DivLens-Sicherung');
  const names = Object.keys(STORES);
  return run(names, 'readwrite', (t) => {
    for (const name of names) {
      const os = t.objectStore(name);
      os.clear();
      for (const v of data[name] || []) os.put(v);
    }
  });
}
