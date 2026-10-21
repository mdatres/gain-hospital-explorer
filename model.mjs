// Counts: Destatis, hospitals by federal state, reference year 2024.
export const STATES = [
  ['BW', 'Baden-Württemberg', 237], ['BY', 'Bayern', 347],
  ['BE', 'Berlin', 86], ['BB', 'Brandenburg', 63], ['HB', 'Bremen', 14],
  ['HH', 'Hamburg', 63], ['HE', 'Hessen', 150], ['MV', 'Mecklenburg-Vorpommern', 38],
  ['NI', 'Niedersachsen', 167], ['NW', 'Nordrhein-Westfalen', 316],
  ['RP', 'Rheinland-Pfalz', 83], ['SL', 'Saarland', 20], ['SN', 'Sachsen', 76],
  ['ST', 'Sachsen-Anhalt', 44], ['SH', 'Schleswig-Holstein', 90], ['TH', 'Thüringen', 47]
];
export const TOTAL = STATES.reduce((sum, s) => sum + s[2], 0);
// Demonstration inputs, NOT measured gAIn results or hardware price quotes.
export const DEFAULTS = Object.freeze({ hospitals: 400, selected: [], mode: 'total',
  years: 3, hours: 8, tariff: 0.30, units: 1,
  quantHardware: 250, rtxHardware: 750, quantWatts: 15, rtxWatts: 130 });
export const LIMITS = { hospitals: [0, TOTAL], years: [1, 20], hours: [0, 24],
  tariff: [0, 5], units: [1, 100], quantHardware: [0, 100000],
  rtxHardware: [0, 100000], quantWatts: [0, 10000], rtxWatts: [0, 10000] };
export function sanitize(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const result = { ...DEFAULTS };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = Number(raw[key]);
    if (raw[key] !== null && raw[key] !== '' && Number.isFinite(value)) result[key] = Math.max(min, Math.min(max, value));
  }
  for (const key of ['hospitals', 'units', 'years']) result[key] = Math.round(result[key]);
  result.mode = raw.mode === 'hardware' ? 'hardware' : 'total';
  result.selected = [...new Set(Array.isArray(raw.selected) ? raw.selected : [])].filter(id => STATES.some(s => s[0] === id));
  return result;
}
export function regionTotal(state) { return STATES.filter(s => state.selected.includes(s[0])).reduce((sum, s) => sum + s[2], 0); }
export function costs(state, hospitals = state.hospitals) {
  const energyFactor = state.hours * 365 * state.years * state.tariff / 1000;
  const units = hospitals * state.units;
  const quantHardware = units * state.quantHardware, rtxHardware = units * state.rtxHardware;
  const quantEnergy = units * state.quantWatts * energyFactor, rtxEnergy = units * state.rtxWatts * energyFactor;
  const quant = quantHardware + (state.mode === 'total' ? quantEnergy : 0);
  const rtx = rtxHardware + (state.mode === 'total' ? rtxEnergy : 0);
  return { quant, rtx, quantHardware, rtxHardware, quantEnergy, rtxEnergy, difference: rtx - quant,
    percent: rtx > 0 ? (rtx - quant) / rtx * 100 : null };
}
