// Publishing is a commit to the site's repository: GitHub Pages serves what's on the branch, so a commit is the
// whole deploy. One publish is one commit (the Git Data API: blobs, a tree, a commit, then the branch moves),
// so the site never sees half of it. The key is a fine-grained personal access token for this one repository
// with Contents: read and write; it stays in this browser.
export class Conflict extends Error {}

const b64 = async blob => {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  return url.slice(url.indexOf(',') + 1);
};
const utf8b64 = text => { const bytes = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));

export function github({ owner, repo, branch = 'main', token, api = 'https://api.github.com' }) {
  const call = async (method, path, body) => {
    const r = await fetch(api + path, {
      method, cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const e = new Error(`GitHub ${method} ${path.split('?')[0]}: ${r.status}`); e.status = r.status;
      try { e.detail = (await r.json()).message; } catch (x) {}
      throw e;
    }
    return r.status === 204 ? null : r.json();
  };
  const R = `/repos/${owner}/${repo}`;
  return {
    owner, repo, branch,
    user: () => call('GET', '/user'),
    info: () => call('GET', R),
    // a JSON file on the branch (or at a commit), with its blob sha
    async readJSON(path, ref = branch) {
      const f = await call('GET', `${R}/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return { sha: f.sha, json: JSON.parse(fromb64(f.content)) };
    },
    // files: [{ path, blob } | { path, text }]. expect: { path, sha } that must still be there (or a Conflict)
    async commit(files, message, { expect = null, onProgress = () => {} } = {}) {
      for (let attempt = 0; ; attempt++) {
        const ref = await call('GET', `${R}/git/ref/heads/${branch}`);
        const head = await call('GET', `${R}/git/commits/${ref.object.sha}`);
        if (expect) {
          let now = null;
          try { now = (await call('GET', `${R}/contents/${expect.path}?ref=${ref.object.sha}`)).sha; } catch (e) { if (e.status !== 404) throw e; }
          if (now !== expect.sha) throw new Conflict('changed since it was loaded');
        }
        const tree = [];
        let done = 0;
        for (const f of files) {
          const blob = await call('POST', `${R}/git/blobs`, f.text != null ? { content: utf8b64(f.text), encoding: 'base64' } : { content: await b64(f.blob), encoding: 'base64' });
          tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
          onProgress(++done / (files.length + 2));
        }
        const t = await call('POST', `${R}/git/trees`, { base_tree: head.tree.sha, tree });
        const c = await call('POST', `${R}/git/commits`, { message, tree: t.sha, parents: [ref.object.sha] });
        onProgress((files.length + 1) / (files.length + 2));
        try {
          await call('PATCH', `${R}/git/refs/heads/${branch}`, { sha: c.sha });
        } catch (e) {
          if (e.status === 422 && attempt < 2) continue;   // someone pushed in between: build on theirs
          throw e;
        }
        onProgress(1);
        return { commit: c.sha, blobs: Object.fromEntries(tree.map(x => [x.path, x.sha])) };
      }
    },
  };
}
