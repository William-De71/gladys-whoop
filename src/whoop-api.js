// -----------------------------------------------------------------------------
// Client of the WHOOP Developer Platform API v2 (https://developer.whoop.com).
//
// OAuth 2.0 (authorization code), with the app the user created on
// https://developer-dashboard.whoop.com:
//   - authorization: https://api.prod.whoop.com/oauth/oauth2/auth with
//     `response_type=code`, `client_id`, `redirect_uri` (registered in the
//     dashboard, exact match), the scopes and a `state` ("must be eight
//     characters long if you need to generate it yourself": app.js makes it
//     exactly eight). `offline` is required to get a refresh token;
//   - token: POST https://api.prod.whoop.com/oauth/oauth2/token, form
//     encoded, `client_id` and `client_secret` in the body (as the docs show
//     them). Code exchange (`grant_type=authorization_code`, `code`,
//     `redirect_uri`) and refresh (`grant_type=refresh_token`,
//     `refresh_token`, `scope=offline`) both answer `access_token`,
//     `expires_in` (3,600 s in the docs), `refresh_token`, `scope`;
//   - the refresh token ROTATES: "your app must use the new refresh token on
//     the subsequent refresh request", and of two concurrent refreshes "the
//     second request would fail". app.js refreshes one at a time and stores
//     the new pair before using it;
//   - every data request carries `Authorization: Bearer`; 401 = expired or
//     invalid token.
//
// Data (https://api.prod.whoop.com/developer): /v2/user/profile/basic,
// /v2/user/measurement/body, and the collections /v2/cycle, /v2/recovery,
// /v2/activity/sleep, /v2/activity/workout (`limit` ≤ 25, `start`, `end`,
// `nextToken`; `{ records, next_token }`, newest first). Revocation: DELETE
// /v2/user/access (204).
//
// Rate limits: 100 requests a minute and 10,000 a day per app, reported in
// X-RateLimit-Limit / -Remaining / -Reset (seconds); 429 beyond.
//
// One request at a time, a 20-second timeout, a user agent naming the
// project. Errors are WhoopApiError with a `kind`; never a token in a message.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const API_URL = 'https://api.prod.whoop.com/developer';
const AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const REVOKE_PATH = '/v2/user/access';
const SCOPES = [
  'offline',
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement',
];
const PAGE_LIMIT = 25;
const TIMEOUT_MS = 20 * 1000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const USER_AGENT = `gladys-whoop/${VERSION} (+https://github.com/William-De71/gladys-whoop)`;

/** An error of the WHOOP API, with its kind. */
class WhoopApiError extends Error {
  /**
   * @param {string} kind - unauthorized, forbidden, not_found, rate_limited,
   * server, refused, network, invalid, oauth (code exchange refused),
   * grant (refresh token refused: connect again).
   * @param {string} message - The message (never a token).
   * @param {object} [details] - `{ status, code, retryAfter }`.
   */
  constructor(kind, message, { status = 0, code = '', retryAfter = null } = {}) {
    super(message);
    this.name = 'WhoopApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * @description The kind of an HTTP error status of a data request.
 * @param {number} status - The status.
 * @returns {string} The kind.
 */
function kindOf(status) {
  if (status === 401) {
    return 'unauthorized';
  }
  if (status === 403) {
    return 'forbidden';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  return status >= 500 ? 'server' : 'refused';
}

/**
 * @description The rate limit headers ("100, 100;window=60, 10000;window=86400").
 * @param {Headers} headers - The headers.
 * @returns {object|null} `{ limit, remaining, reset }` (numbers, null when absent).
 */
function readRateLimit(headers) {
  const first = (name) => {
    const value = headers?.get?.(name);
    if (!value) {
      return null;
    }
    const number = Number(String(value).split(/[,;]/)[0].trim());
    return Number.isFinite(number) ? number : null;
  };
  const limit = first('X-RateLimit-Limit');
  const remaining = first('X-RateLimit-Remaining');
  const reset = first('X-RateLimit-Reset');
  return limit !== null || remaining !== null || reset !== null
    ? { limit, remaining, reset }
    : null;
}

/**
 * @description The authorization URL of WHOOP.
 * @param {object} params - `{ clientId, redirectUri, state }`.
 * @returns {string} The URL to open.
 * @example
 * buildAuthorizeUrl({ clientId: 'abc', redirectUri: 'https://my.gladysassistant.com/redirect/oauth', state: 'Ab3dEf7h' });
 */
function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
  }).toString();
  return url.toString();
}

/**
 * @description The client.
 * @param {object} [options] - `{ fetch, now }`.
 * @returns {object} The client.
 */
function createWhoopClient({ fetch: fetchFn = globalThis.fetch, now = () => Date.now() } = {}) {
  let queue = Promise.resolve();
  const stats = { day: '', count: 0, last: null, rateLimit: null };

  /**
   * @description Count a request (per UTC day).
   */
  function count() {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (stats.day !== day) {
      stats.day = day;
      stats.count = 0;
    }
    stats.count += 1;
    stats.last = now();
  }

  /**
   * @description Run one request at a time.
   * @param {Function} task - `async () => value`.
   * @returns {Promise<unknown>} Its result.
   */
  function serial(task) {
    const run = queue.catch(() => {}).then(task);
    queue = run.catch(() => {});
    return run;
  }

  /**
   * @description Send a request, read its JSON answer.
   * @param {string} url - The URL.
   * @param {object} init - fetch init.
   * @returns {Promise<{ status: number, body: unknown }>} The answer.
   */
  async function send(url, init) {
    count();
    let response;
    try {
      response = await fetchFn(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new WhoopApiError('network', `WHOOP unreachable: ${err.message}`);
    }
    const rateLimit = readRateLimit(response.headers);
    if (rateLimit) {
      stats.rateLimit = { ...rateLimit, at: now() };
    }
    const text = await response.text().catch(() => '');
    let body = null;
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }
    return { status: response.status, body };
  }

  /**
   * @description A token request (code exchange or refresh).
   * @param {object} form - The form fields, credentials included.
   * @param {string} failKind - The kind of a refusal: `oauth` or `grant`.
   * @returns {Promise<object>} `{ accessToken, refreshToken, expiresAt, scope }`.
   */
  function tokenRequest(form, failKind) {
    return serial(async () => {
      const { status, body } = await send(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(form).toString(),
      });
      const accessToken = typeof body?.access_token === 'string' ? body.access_token : '';
      if (status !== 200 || !accessToken) {
        const code = typeof body?.error === 'string' ? body.error : `http_${status}`;
        // A refused refresh token is final; a server or network fault is not.
        const kind = status >= 500 || status === 429 ? kindOf(status) : failKind;
        throw new WhoopApiError(kind, `WHOOP token endpoint refused: ${code}`, {
          status,
          code,
        });
      }
      const expiresIn = Number(body.expires_in);
      return {
        accessToken,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : '',
        expiresAt: now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
        scope: typeof body.scope === 'string' ? body.scope : '',
      };
    });
  }

  /**
   * @description A request to the API with the user token.
   * @param {string} method - GET or DELETE.
   * @param {string} path - '/v2/recovery'.
   * @param {object} options - `{ token, query }`.
   * @returns {Promise<{ status: number, body: unknown }>} The answer (2xx).
   */
  function request(method, path, { token, query }) {
    return serial(async () => {
      const url = new URL(`${API_URL}${path}`);
      if (query) {
        url.search = new URLSearchParams(
          Object.entries(query).filter(([, value]) => value !== undefined && value !== null),
        ).toString();
      }
      const { status, body } = await send(url.toString(), {
        method,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (status >= 200 && status < 300) {
        if (body === undefined) {
          throw new WhoopApiError('invalid', `WHOOP sent an unreadable answer to ${path}`, {
            status,
          });
        }
        return { status, body };
      }
      const reset = stats.rateLimit?.reset;
      throw new WhoopApiError(kindOf(status), `WHOOP answered HTTP ${status} to ${path}`, {
        status,
        retryAfter: status === 429 && Number.isFinite(reset) ? reset : null,
      });
    });
  }

  /**
   * @description The first page of a collection, newest first.
   * @param {string} path - The path.
   * @param {string} token - The user token.
   * @param {object} [query] - `{ limit, start, end }`.
   * @returns {Promise<unknown[]>} The records.
   */
  async function collection(path, token, query = {}) {
    const { body } = await request('GET', path, {
      token,
      query: {
        limit: Math.min(PAGE_LIMIT, query.limit ?? PAGE_LIMIT),
        start: query.start,
        end: query.end,
      },
    });
    const records = body?.records;
    if (!Array.isArray(records)) {
      throw new WhoopApiError('invalid', `WHOOP sent no records to ${path}`);
    }
    return records;
  }

  return {
    stats,

    /**
     * @description Exchange the authorization code.
     * @param {object} params - `{ clientId, clientSecret, code, redirectUri }`.
     * @returns {Promise<object>} The token.
     */
    exchangeCode({ clientId, clientSecret, code, redirectUri }) {
      return tokenRequest(
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        },
        'oauth',
      );
    },

    /**
     * @description Trade the refresh token for a new pair (the old one dies).
     * @param {object} params - `{ clientId, clientSecret, refreshToken }`.
     * @returns {Promise<object>} The token.
     */
    refresh({ clientId, clientSecret, refreshToken }) {
      return tokenRequest(
        {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'offline',
        },
        'grant',
      );
    },

    /**
     * @description Revoke the access of the app to the user's data.
     * @param {string} token - The user token.
     * @returns {Promise<void>}
     */
    async revoke(token) {
      await request('DELETE', REVOKE_PATH, { token });
    },

    profile: async (token) => (await request('GET', '/v2/user/profile/basic', { token })).body,
    body: async (token) => (await request('GET', '/v2/user/measurement/body', { token })).body,
    cycles: (token, query) => collection('/v2/cycle', token, query),
    recoveries: (token, query) => collection('/v2/recovery', token, query),
    sleeps: (token, query) => collection('/v2/activity/sleep', token, query),
    workouts: (token, query) => collection('/v2/activity/workout', token, query),
  };
}

export {
  API_URL,
  AUTHORIZE_URL,
  TOKEN_URL,
  SCOPES,
  PAGE_LIMIT,
  USER_AGENT,
  WhoopApiError,
  buildAuthorizeUrl,
  createWhoopClient,
  readRateLimit,
};
