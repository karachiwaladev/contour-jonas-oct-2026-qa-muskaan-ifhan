// Minimal promise wrapper around IndexedDB for the todo app.
// Bump DB_VERSION and extend upgrade() when later tickets add fields or indexes.
const DB_NAME = 'factory-todo';
const DB_VERSION = 3;
const STORE = 'tasks';

let dbPromise;

// Fill in fields added by later tickets, so every task has the current shape.
function normalize(t) {
  return { ...t, dueDate: t.dueDate ?? null, tags: t.tags ?? [], priority: t.priority ?? null, repeat: t.repeat ?? null };
}

// Schema changes go in per-version steps; data is migrated in ONE pass at the end.
// (Separate cursors per step race each other when upgrading across several versions,
// e.g. v1 -> v3, and a later step can write back a stale copy of the record.)
function upgrade(db, tx, oldVersion) {
  if (oldVersion < 1) {
    const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    store.createIndex('createdAt', 'createdAt');
  }
  if (oldVersion < 2) {
    // Ticket #4: due dates (YYYY-MM-DD, local) and tags
    const store = tx.objectStore(STORE);
    store.createIndex('dueDate', 'dueDate');
    store.createIndex('tags', 'tags', { multiEntry: true });
  }
  if (oldVersion < 3) {
    // Ticket #6: priority ('high' | 'medium' | 'low' | null)
    tx.objectStore(STORE).createIndex('priority', 'priority');
  }
  if (oldVersion > 0) {
    tx.objectStore(STORE).openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      cursor.update(normalize(cursor.value));
      cursor.continue();
    };
  }
}

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => upgrade(req.result, req.transaction, e.oldVersion);
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

// Ticket #18: tell other open tabs that the data changed, so they reload instead of
// saving stale copies over newer data.
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(DB_NAME) : null;
const notify = () => channel?.postMessage('changed');

// classic script (not a module) so the app also works when opened from file://
window.db = {
  onChange(callback) {
    if (channel) channel.onmessage = callback;
  },
  async getAll() {
    const tasks = await run('readonly', (s) => s.index('createdAt').getAll());
    return (tasks ?? []).map(normalize); // also heals records from an interrupted migration
  },
  async add(fields) {
    const now = Date.now();
    const task = { dueDate: null, tags: [], priority: null, ...fields, done: false, createdAt: now, updatedAt: now };
    const id = await run('readwrite', (s) => s.add(task));
    notify();
    return { ...task, id };
  },
  // Ticket #18: apply only `changes` to the record as stored now (read and write in one
  // transaction), so a stale in-memory copy can't overwrite newer fields from another tab.
  // Returns null if the task no longer exists, e.g. deleted in another tab; it isn't revived.
  async update(id, changes) {
    const db = await open();
    const updated = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let result = null;
      store.get(id).onsuccess = (e) => {
        if (!e.target.result) return;
        result = { ...normalize(e.target.result), ...changes, id, updatedAt: Date.now() };
        store.put(result);
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (updated) notify();
    return updated;
  },
  // Ticket #18: mark a task done/undone. Completing a recurring task also creates its next
  // occurrence (fields from makeNext(task)) in the SAME transaction and records it as nextId,
  // so two tabs completing the same task at once still create only one copy.
  // Returns { task, created } or null if the task no longer exists.
  async setDone(id, done, makeNext) {
    const db = await open();
    const out = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let task = null, created = null;
      store.get(id).onsuccess = (e) => {
        if (!e.target.result) return;
        const now = Date.now();
        task = { ...normalize(e.target.result), done, id, updatedAt: now };
        if (!done || !task.repeat || task.nextId) return store.put(task);
        const next = { ...normalize({ tags: [] }), ...makeNext(task), done: false, createdAt: now, updatedAt: now };
        store.add(next).onsuccess = (ev) => {
          created = { ...next, id: ev.target.result };
          task.nextId = created.id;
          store.put(task);
        };
      };
      tx.oncomplete = () => resolve(task && { task, created });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (out) notify();
    return out;
  },
  async remove(ids) {
    await run('readwrite', (s) => { for (const id of [].concat(ids)) s.delete(id); });
    notify();
  },
};
