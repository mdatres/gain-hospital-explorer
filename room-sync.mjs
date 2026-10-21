import { sanitize } from './model.mjs';

export function createRoomClient({ room, endpoint, getState, getRole, onState, onStatus,
  fetcher = fetch, saved = {}, save = () => {}, auto = true }) {
  const client = saved.client || crypto.randomUUID();
  let sequence = Number.isSafeInteger(saved.sequence) ? saved.sequence : 0;
  let pending = { ...(saved.sending?.patch || {}), ...(saved.pending || {}) };
  let sending = null, revision = 0, lastWritten = 0, timer, aborter;
  let stopped = false, busy = false, lastStatus;
  const persist = () => save({ client, sequence, pending, sending });
  const notify = (phase, message) => { lastStatus = { phase, message }; onStatus(lastStatus); };
  function schedule(delay) {
    if (!auto || stopped) return;
    clearTimeout(timer); timer = setTimeout(flush, delay);
  }
  async function flush() {
    if (stopped || busy) return;
    busy = true; clearTimeout(timer);
    if (!sending && Object.keys(pending).length) {
      sending = { sequence: ++sequence, patch: pending }; pending = {}; persist();
    }
    aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), 8000);
    let success = false;
    try {
      const response = await fetcher(endpoint, {
        method: 'POST', mode: 'cors', credentials: 'same-origin', cache: 'no-store', signal: aborter.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${room}` },
        body: JSON.stringify({ client, role: getRole(), initial: getState(),
          sequence: sending?.sequence || 0, patch: sending?.patch || {}, seenRevision: revision }),
      });
      if (!response.ok) throw new Error(`Service returned ${response.status}`);
      const data = await response.json();
      if (!data.state || !Number.isSafeInteger(data.revision)) throw new Error('Invalid service response');
      if (stopped) return;
      if (sending) lastWritten = data.revision;
      sending = null; revision = data.revision; persist();
      // Preserve any slider changes made while this request was in flight.
      onState(sanitize({ ...data.state, ...pending }));
      if (!data.otherPresent) notify('waiting', getRole() === 'display' ? 'Room ready · scan the QR code with your iPad' : 'Waiting for the presentation screen to open this room.');
      else if (Object.keys(pending).length || data.otherRevision < lastWritten) notify('sending', 'Sending your latest choice to the other screen…');
      else notify('connected', 'Connected. Updates are confirmed by the other screen.');
      success = true;
    } catch {
      if (!stopped) notify('offline', 'Connection interrupted. Your choices are saved; reconnecting…');
    } finally {
      clearTimeout(timeout); busy = false;
      schedule(success ? (Object.keys(pending).length ? 80 : 1000) : 2000);
    }
  }
  persist();
  return {
    start() { notify('connecting', 'Connecting your screens…'); schedule(0); },
    edit(changes) { pending = { ...pending, ...changes }; persist(); notify('sending', 'Sending your latest choice to the other screen…'); if (!busy) schedule(80); },
    flush,
    stop() { stopped = true; clearTimeout(timer); aborter?.abort(); persist(); },
    status: () => lastStatus,
  };
}
