// Minimal promise wrapper around IndexedDB for the todo app.
// Bump DB_VERSION and extend upgrade() when later tickets add fields or indexes.
const DB_NAME = 'factory-todo';
const DB_VERSION = 1;
const STORE = 'tasks';

let dbPromise;

function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    store.createIndex('createdAt', 'createdAt');
  }
}

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// classic script (not a module) so the app also works when opened from file://
window.db = {
  async getAll() {
    const tasks = await run('readonly', (s) => s.index('createdAt').getAll());
    return tasks ?? [];
  },
  async add(title) {
    const now = Date.now();
    const task = { title, done: false, createdAt: now, updatedAt: now };
    const id = await run('readwrite', (s) => s.add(task));
    return { ...task, id };
  },
  async update(task) {
    const updated = { ...task, updatedAt: Date.now() };
    await run('readwrite', (s) => s.put(updated));
    return updated;
  },
  async remove(ids) {
    await run('readwrite', (s) => { for (const id of [].concat(ids)) s.delete(id); });
  },
};
