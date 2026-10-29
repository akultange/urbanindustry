// What the admin keeps in this browser: pictures it hasn't published yet (IndexedDB, as blobs; the site's
// ?draft preview reads them from here too), the unpublished catalog, the sign-in key and the language.
const DB = 'ui-admin', STORE = 'files';
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return dbP;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
    let out; const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
};
export const files = {
  put: (key, blob) => tx('readwrite', st => st.put(blob, key)),
  get: key => tx('readonly', st => st.get(key)),
  del: key => tx('readwrite', st => st.delete(key)),
  clear: () => tx('readwrite', st => st.clear()),
  async keys() { return (await tx('readonly', st => st.getAllKeys())) || []; },
};

const LS = 'ui.admin.';
export const local = {
  get(k, d = null) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(LS + k); else localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
