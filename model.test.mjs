import test from 'node:test';
import assert from 'node:assert/strict';
import { STATES, TOTAL, DEFAULTS, sanitize, costs, regionTotal } from './model.mjs';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
test('official 16-state counts reconcile to the German total', () => {
  assert.equal(STATES.length, 16); assert.equal(new Set(STATES.map(s => s[0])).size, 16); assert.equal(TOTAL, 1841);
  assert.equal(regionTotal(sanitize({ selected: ['BY', 'SN'] })), 423);
  assert.equal(regionTotal(sanitize({ selected: STATES.map(s => s[0]) })), 1841);
});
test('hardware only excludes energy regardless of operating settings', () => {
  const c = costs(sanitize({ ...DEFAULTS, mode: 'hardware', years: 20, tariff: 5, hours: 24 }));
  assert.equal(c.quant, 100000); assert.equal(c.rtx, 300000); assert.equal(c.difference, 200000);
});
test('three-year energy calculation uses watts converted to kilowatts', () => {
  const c = costs(DEFAULTS); near(c.quantEnergy, 15768); near(c.rtxEnergy, 136656);
  near(c.quant, 115768); near(c.rtx, 436656); near(c.difference, 320888);
});
test('zero hospitals yields zero cost and no undefined percentage', () => {
  const c = costs(DEFAULTS, 0); assert.equal(c.quant, 0); assert.equal(c.rtx, 0); assert.equal(c.percent, null);
});
test('zero operating hours or tariff removes energy cost', () => {
  near(costs({ ...DEFAULTS, hours: 0 }).quant, 100000);
  near(costs({ ...DEFAULTS, tariff: 0 }).rtx, 300000);
});
test('setups scale both hardware and energy; years scale only energy', () => {
  near(costs({ ...DEFAULTS, units: 2 }).quant, costs(DEFAULTS).quant * 2);
  const longer = costs({ ...DEFAULTS, years: 6 }); near(longer.quantHardware, 100000); near(longer.quantEnergy, 31536);
});
test('model does not assume quantization is cheaper', () => {
  const c = costs({ ...DEFAULTS, mode: 'hardware', quantHardware: 1000, rtxHardware: 500 });
  assert.equal(c.difference, -200000); assert.equal(c.percent, -100);
});
test('remote and typed inputs are clamped and state selections deduplicated', () => {
  const s = sanitize({ hospitals: 999999, units: -3, years: Infinity, hours: -10, tariff: 'oops', selected: ['BY','BY','SN','BAD'], quantHardware: null });
  assert.equal(s.hospitals, 1841); assert.equal(s.units, 1); assert.equal(s.hours, 0); assert.equal(s.tariff, .30);
  assert.equal(s.years, 3); assert.equal(s.quantHardware, 250); assert.deepEqual(s.selected, ['BY', 'SN']);
  assert.equal(sanitize({hospitals: -1}).hospitals, 0); assert.equal(sanitize(null).hospitals, 400);
});
