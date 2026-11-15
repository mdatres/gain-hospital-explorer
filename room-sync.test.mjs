import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomClient } from './room-sync.mjs';
import { DEFAULTS, sanitize } from './model.mjs';

function harness(t, { role = 'controller', otherPresent = true, saved = {}, auto = true } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let state = sanitize(DEFAULTS), server = sanitize(DEFAULTS), revision = 0, otherRevision = 0;
  let sequence = 0, outbox, responder;
  const calls = [], applied = [], statuses = [];
  const reply = body => {
    if (body.sequence > sequence && Object.keys(body.patch).length) {
      server = sanitize({ ...server, ...body.patch }); revision++; sequence = body.sequence;
    }
    return { ok: true, json: async () => ({ state: server, revision, otherPresent, otherRevision }) };
  };
  const client = createRoomClient({ room: 'ABCDEFGHJKLMNPQR', endpoint: 'https://example.test/api/sync',
    getState: () => state, getRole: () => role, saved, auto,
    save: value => { outbox = JSON.parse(JSON.stringify(value)); },
    onState: value => { state = value; applied.push(value); },
    onStatus: value => statuses.push(value),
    fetcher: async (url, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      return responder ? responder(body) : reply(body);
    },
  });
  t.after(() => client.stop());
  return { client, calls, applied, statuses, reply,
    respondWith: fn => { responder = fn; },
    acknowledge: () => { otherRevision = revision; },
    presence: value => { otherPresent = value; },
    outbox: () => outbox,
  };
}

async function advance(t, ms) {
  t.mock.timers.tick(ms);
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

test('a continuous slider drag sends within 40 ms without waiting for a pause', async t => {
  const h = harness(t); await h.client.flush();
  h.client.edit({ hospitals: 100 });
  for (const hospitals of [200, 300, 400]) { await advance(t, 10); h.client.edit({ hospitals }); }
  await advance(t, 10);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].patch, { hospitals: 400 });
  for (const hospitals of [500, 600, 700, 800]) {
    h.client.edit({ hospitals }); await advance(t, 10);
  }
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].patch.hospitals, 800);
});

test('paired presentation polls after 250 ms', async t => {
  const display = harness(t, { role: 'display' }); await display.client.flush();
  await advance(t, 249); assert.equal(display.calls.length, 1);
  await advance(t, 1); assert.equal(display.calls.length, 2);
});

test('idle controllers retain the one-second polling interval', async t => {
  const controller = harness(t); await controller.client.flush();
  await advance(t, 999); assert.equal(controller.calls.length, 1);
  await advance(t, 1); assert.equal(controller.calls.length, 2);
});

test('an unpaired display retains the slower one-second polling interval', async t => {
  const h = harness(t, { role: 'display', otherPresent: false }); await h.client.flush();
  await advance(t, 999); assert.equal(h.calls.length, 1);
  await advance(t, 1); assert.equal(h.calls.length, 2);
  assert.equal(h.client.status().phase, 'waiting');
});

test('controller checks acknowledgement promptly without confirming unread changes', async t => {
  const h = harness(t); await h.client.flush();
  h.client.edit({ hospitals: 100 }); await advance(t, 40);
  assert.equal(h.client.status().phase, 'sending');
  h.acknowledge(); await advance(t, 250);
  assert.equal(h.client.status().phase, 'connected');
  const count = h.calls.length;
  await advance(t, 999); assert.equal(h.calls.length, count);
  await advance(t, 1); assert.equal(h.calls.length, count + 1);
});

test('edits made in flight survive the old response and are sent immediately next', async t => {
  const h = harness(t); await h.client.flush();
  let release;
  h.respondWith(body => new Promise(resolve => { release = () => resolve(h.reply(body)); }));
  h.client.edit({ hospitals: 100 }); await advance(t, 40);
  h.client.edit({ hospitals: 800, years: 5 });
  assert.equal(h.calls.length, 2);
  release(); await advance(t, 0);
  assert.equal(h.applied.at(-1).hospitals, 800);
  assert.equal(h.applied.at(-1).years, 5);
  h.respondWith(null); await advance(t, 0);
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.calls[2].patch, { hospitals: 800, years: 5 });
  assert.equal(h.calls[2].sequence, h.calls[1].sequence + 1);
});

test('a lost response retries the same sequence before sending newer edits', async t => {
  const h = harness(t); await h.client.flush();
  h.respondWith(body => { h.reply(body); throw new Error('response lost'); });
  h.client.edit({ hospitals: 100 }); await advance(t, 40);
  assert.equal(h.client.status().phase, 'offline');
  const lost = h.calls.at(-1);
  assert.deepEqual(h.outbox().sending.patch, { hospitals: 100 });
  h.client.edit({ years: 5 }); h.respondWith(null); await advance(t, 40);
  assert.deepEqual(h.calls.at(-1), lost);
  await advance(t, 0);
  assert.deepEqual(h.calls.at(-1).patch, { years: 5 });
  assert.equal(h.applied.at(-1).hospitals, 100);
  assert.equal(h.applied.at(-1).years, 5);
});

test('reload recovers the newest saved edits and advances the sequence', async t => {
  const h = harness(t, { saved: { client: 'saved-client-123456', sequence: 7,
    sending: { sequence: 7, patch: { hospitals: 100, years: 4 } }, pending: { hospitals: 800 } } });
  await h.client.flush();
  assert.equal(h.calls[0].client, 'saved-client-123456');
  assert.equal(h.calls[0].sequence, 8);
  assert.deepEqual(h.calls[0].patch, { hospitals: 800, years: 4 });
});

test('stopping cancels queued polls and prevents in-flight responses changing the page', async t => {
  const h = harness(t); let release;
  h.respondWith(body => new Promise(resolve => { release = () => resolve(h.reply(body)); }));
  const request = h.client.flush();
  h.client.stop(); release(); await request;
  await advance(t, 10000);
  assert.equal(h.calls.length, 1);
  assert.equal(h.applied.length, 0);
});
