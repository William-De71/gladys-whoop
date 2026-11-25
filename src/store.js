// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/whoop.json (the only
// writable place of the container):
//   - `userId`, `name`  the linked WHOOP member (first name only, for the
//                       device name);
//   - `cycles`, `recoveries`, `sleeps`, `workouts`  the last records,
//                       newest first;
//   - `body`, `bodyAt`  the body measurement and when it was read;
//   - `seen`            what the scene triggers already announced (ids of
//                       scored recoveries, sleeps and workouts), and
//                       `baseline`, the kinds read at least once: the first
//                       reading of a kind announces nothing, so neither the
//                       first start nor a restart fires old events;
//   - `fetchedAt`       when the last reading ran.
// Never a token here: tokens live in internal config keys.
// A store belongs to one WHOOP member: linking another one starts afresh.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/whoop.json';
const KEEP = { cycles: 14, recoveries: 14, sleeps: 20, workouts: 20, seenIds: 200 };
const KINDS = ['recoveries', 'sleeps', 'workouts'];
const LISTS = ['cycles', 'recoveries', 'sleeps', 'workouts'];

const EMPTY = () => ({
  userId: null,
  name: null,
  cycles: [],
  recoveries: [],
  sleeps: [],
  workouts: [],
  body: null,
  bodyAt: 0,
  seen: Object.fromEntries(KINDS.map((kind) => [kind, []])),
  baseline: Object.fromEntries(KINDS.map((kind) => [kind, false])),
  fetchedAt: null,
});

/**
 * @description Merge a stored object over the empty store (unknown or broken
 * parts fall back to their empty value).
 * @param {object} raw - The stored object.
 * @returns {object} The data.
 */
function sanitize(raw) {
  const data = EMPTY();
  if (!raw || typeof raw !== 'object') {
    return data;
  }
  for (const key of ['userId', 'name']) {
    data[key] = typeof raw[key] === 'string' ? raw[key] : null;
  }
  for (const key of LISTS) {
    data[key] = Array.isArray(raw[key])
      ? raw[key].filter((item) => item && typeof item === 'object')
      : [];
  }
  data.body = raw.body && typeof raw.body === 'object' ? raw.body : null;
  data.bodyAt = Number.isFinite(raw.bodyAt) ? raw.bodyAt : 0;
  for (const kind of KINDS) {
    data.seen[kind] = Array.isArray(raw.seen?.[kind]) ? raw.seen[kind].map(String) : [];
    data.baseline[kind] = raw.baseline?.[kind] === true;
  }
  data.fetchedAt = Number.isFinite(raw.fetchedAt) ? raw.fetchedAt : null;
  return data;
}

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save, reset }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        store.data = sanitize(JSON.parse(await readFile(path, 'utf8')));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        store.data = EMPTY();
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
    /**
     * @description Start afresh for a WHOOP member.
     * @param {string|null} userId - The user id.
     */
    reset(userId) {
      store.data = { ...EMPTY(), userId };
    },
  };
  return store;
}

export { DEFAULT_PATH, KEEP, KINDS, LISTS, EMPTY, sanitize, createStore };
