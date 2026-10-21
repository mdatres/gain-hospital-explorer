import test from 'node:test';
import assert from 'node:assert/strict';
import { createDelivery, decodePacket } from './sync.mjs';

function harness(serialization = 'raw') {
  let time = 100, failures = 0;
  const sent = [], applied = [];
  const connection = { open: true, serialization, send: value => sent.push(value) };
  const link = createDelivery({ connection, onState: packet => applied.push(packet), onFailure: () => failures++, now: () => time });
  return { link, sent, applied, connection, advance: ms => time += ms, failures: () => failures, packets: () => sent.map(decodePacket) };
}
const state = (id, hospitals) => ({ type: 'state', id, state: { hospitals } });

test('new data connections send JSON text and require a reply before confirmation', () => {
  const h = harness(); h.link.open();
  assert.equal(typeof h.sent[0], 'string');
  assert.equal(h.link.status().confirmed, false);
  h.link.receive('{"type":"pong"}');
  assert.equal(h.link.status().confirmed, true);
});
test('a lost state delivery is retried, then a matching acknowledgement clears it', () => {
  const h = harness(); h.link.open(); h.link.sendState(state('update-1', 100));
  h.advance(1600); h.link.pulse();
  assert.equal(h.packets().filter(p => p.type === 'state').length, 2);
  h.link.receive('{"type":"ack","id":"update-1"}');
  assert.equal(h.link.status().pending, false);
  h.advance(2000); h.link.pulse();
  assert.equal(h.packets().filter(p => p.type === 'state').length, 2);
});
test('a lost acknowledgement causes a re-ack without applying the state twice', () => {
  const h = harness(); h.link.open();
  const packet = JSON.stringify(state('same-update', 423));
  h.link.receive(packet); h.link.receive(packet);
  assert.equal(h.applied.length, 1);
  assert.equal(h.packets().filter(p => p.type === 'ack').length, 2);
});
test('an old acknowledgement cannot cancel a newer slider value', () => {
  const h = harness(); h.link.open(); h.link.sendState(state('old', 100)); h.link.sendState(state('latest', 400));
  h.link.receive('{"type":"ack","id":"old"}');
  assert.equal(h.link.status().pending, true);
  h.advance(1600); h.link.pulse();
  assert.equal(h.packets().at(-1).id, 'latest');
});
test('an open channel with no delivery response triggers recovery rather than claiming success', () => {
  const h = harness(); h.link.open(); h.link.sendState(state('lost', 100));
  h.advance(5500); h.link.pulse();
  assert.equal(h.link.status().stalled, true);
  assert.equal(h.link.status().confirmed, false);
  h.advance(11000); h.link.pulse(); h.link.pulse();
  assert.equal(h.failures(), 1);
});
test('legacy object messages remain readable and use the negotiated serializer', () => {
  const h = harness('json'); h.link.open(); h.link.receive(state('legacy', 500));
  assert.equal(h.applied[0].state.hospitals, 500);
  assert.equal(typeof h.sent.at(-1), 'object');
});
test('malformed or oversized messages are ignored', () => {
  for (const raw of ['{', 'x'.repeat(20001), null, [], { type: 'state', id: '', state: {} }, { type: 'state', id: 'x', state: [] }]) assert.equal(decodePacket(raw), null);
});
test('closed connections neither receive nor retry state', () => {
  const h = harness(); h.link.open(); h.link.sendState(state('a', 100)); h.link.close();
  const count = h.sent.length; h.advance(20000); h.link.pulse(); h.link.receive(JSON.stringify(state('b', 200)));
  assert.equal(h.sent.length, count); assert.equal(h.applied.length, 0);
});
