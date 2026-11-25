// A fake WHOOP (OAuth token endpoint + Developer API v2), served through the
// `fetch` option of the integration. It behaves like the documentation says:
//   - the token endpoint wants `client_id` and `client_secret` in the form
//     body; a code is single use (a second use is refused and kills every
//     token issued, `revoked`, which the tests check never happens);
//   - the refresh token ROTATES: each refresh answers a new pair, and the
//     old refresh token is refused afterwards (`invalid_grant`); a refresh
//     token used twice kills the whole chain (`revoked`), like the
//     authorization server behind WHOOP does on reuse;
//   - every /developer/v2 request needs the current access token, 401
//     otherwise (also once `expired` is set or after a revocation).
// Tests never touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { answers as defaultAnswers } from './whoop-data.js';

const CLIENT = { id: 'c0ffee00-1234-4abc-9def-0123456789ab', secret: 'verySecret' };
const CONFIG = { client_id: CLIENT.id, client_secret: CLIENT.secret, language: 'fr' };
const REDIRECT = 'https://my.gladysassistant.com/redirect/oauth';
const silent = { info() {}, warn() {}, error() {}, debug() {} };

const ROUTES = [
  ['POST', /^\/oauth\/oauth2\/token$/, 'token'],
  ['GET', /^\/developer\/v2\/user\/profile\/basic$/, 'profile'],
  ['GET', /^\/developer\/v2\/user\/measurement\/body$/, 'body'],
  ['DELETE', /^\/developer\/v2\/user\/access$/, 'revoke'],
  ['GET', /^\/developer\/v2\/cycle$/, 'cycles'],
  ['GET', /^\/developer\/v2\/recovery$/, 'recoveries'],
  ['GET', /^\/developer\/v2\/activity\/sleep$/, 'sleeps'],
  ['GET', /^\/developer\/v2\/activity\/workout$/, 'workouts'],
];

/**
 * @description A fake WHOOP.
 * @param {object} [options] - `{ errors, answers, offline }`: `errors` maps a
 * route name (or '*') to an HTTP status or 'network'; `offline: false`
 * answers no refresh token (the scope was refused).
 * @returns {Function} A fetch function with `requests`, `errors`, `answers`,
 * `codes` (every code received), `revoked`, `expired`, `tokens`.
 */
function fakeWhoop({ errors = {}, answers = defaultAnswers(), offline = true } = {}) {
  let generation = 1;
  const pair = () => ({
    access: `access-token-${generation}`,
    refresh: `refresh-token-${generation}`,
  });
  const fake = async (raw, init = {}) => {
    const url = new URL(raw);
    const method = init.method ?? 'GET';
    const route = ROUTES.find(([verb, pattern]) => verb === method && pattern.test(url.pathname));
    const name = route ? route[2] : 'unknown';
    const headers = init.headers ?? {};
    const request = { name, method, url: raw, headers, body: init.body };
    fake.requests.push(request);
    if (fake.delay) {
      await fake.delay;
    }
    const error = fake.errors[name] ?? fake.errors['*'];
    if (error === 'network') {
      throw new TypeError('fetch failed');
    }
    if (url.hostname !== 'api.prod.whoop.com') {
      return new Response('', { status: 404 });
    }
    if (name === 'token') {
      const form = Object.fromEntries(new URLSearchParams(init.body));
      request.form = form;
      if (form.client_id !== CLIENT.id || form.client_secret !== CLIENT.secret) {
        return Response.json(
          { error: 'invalid_client', error_description: 'Client authentication failed' },
          { status: 401 },
        );
      }
      if (error) {
        return Response.json({ error: 'server_error' }, { status: error });
      }
      if (form.grant_type === 'authorization_code') {
        if (fake.codes.includes(form.code)) {
          fake.revoked = true;
          return Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
        fake.codes.push(form.code);
        generation += 1;
      } else if (form.grant_type === 'refresh_token') {
        fake.refreshes.push(form.refresh_token);
        if (fake.revoked || form.refresh_token !== fake.tokens.refresh) {
          // Reuse of a rotated refresh token: the whole chain dies.
          fake.revoked = true;
          return Response.json(
            { error: 'invalid_grant', error_description: 'The refresh token was already used' },
            { status: 400 },
          );
        }
        generation += 1;
      } else {
        return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
      }
      fake.revoked = false;
      fake.expired = false;
      fake.tokens = pair();
      return Response.json({
        access_token: fake.tokens.access,
        expires_in: 3600,
        ...(offline ? { refresh_token: fake.tokens.refresh } : {}),
        scope: fake.answers.token.scope,
        token_type: 'bearer',
      });
    }
    if (headers.Authorization !== `Bearer ${fake.tokens.access}` || fake.revoked || fake.expired) {
      return new Response('', { status: 401 });
    }
    if (error) {
      const rateHeaders =
        error === 429
          ? {
              'X-RateLimit-Limit': '100, 100;window=60, 10000;window=86400',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': '1200',
            }
          : {};
      return new Response('', { status: error, headers: rateHeaders });
    }
    const ok = (body, status = 200) =>
      Response.json(body, {
        status,
        headers: {
          'X-RateLimit-Limit': '100, 100;window=60, 10000;window=86400',
          'X-RateLimit-Remaining': '96',
          'X-RateLimit-Reset': '40',
        },
      });
    const page = (records) => {
      const limit = Number(url.searchParams.get('limit') ?? 10);
      fake.limits.push(limit);
      return ok({
        records: records.slice(0, limit),
        next_token: records.length > limit ? 'next' : '',
      });
    };
    switch (name) {
      case 'profile':
        return ok(fake.answers.profile);
      case 'body':
        return ok(fake.answers.body);
      case 'revoke':
        fake.revoked = true;
        return new Response(null, { status: 204 });
      case 'cycles':
        return page(fake.answers.cycles);
      case 'recoveries':
        return page(fake.answers.recoveries);
      case 'sleeps':
        return page(fake.answers.sleeps);
      case 'workouts':
        return page(fake.answers.workouts);
      default:
        return new Response('', { status: 404 });
    }
  };
  fake.requests = [];
  fake.errors = { ...errors };
  fake.answers = answers;
  fake.codes = [];
  fake.refreshes = [];
  fake.limits = [];
  fake.revoked = false;
  fake.expired = false;
  fake.tokens = pair();
  fake.delay = null;
  fake.calls = (name) => fake.requests.filter((request) => request.name === name);
  return fake;
}

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'gladys-whoop-')), 'whoop.json');

// A Gladys client only used for its external ids (selector `test-integration`).
const fakeGladys = createFakeGladys({});

export { CLIENT, CONFIG, REDIRECT, silent, fakeWhoop, storePath, fakeGladys };
