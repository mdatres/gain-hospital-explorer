// Send small scenario messages as JSON text. An open WebRTC channel alone does
// not confirm delivery; ping/pong and state acknowledgements verify both ways.
export function decodePacket(raw) {
  try {
    const value = typeof raw === 'string' ? (raw.length <= 20000 ? JSON.parse(raw) : null) : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.type === 'ping' || value.type === 'pong') return { type: value.type };
    if (typeof value.id !== 'string' || !value.id || value.id.length > 80) return null;
    if (value.type === 'ack') return { type: 'ack', id: value.id };
    if (value.type === 'state' && value.state && typeof value.state === 'object' && !Array.isArray(value.state)) return value;
  } catch {}
  return null;
}

export function createDelivery({ connection, onState, onStatus = () => {}, onAcknowledged = () => {}, onFailure = () => {}, now = Date.now }) {
  let active = false, confirmed = false, openedAt = 0, confirmedAt = 0;
  let pingAt = 0, pending = null, failed = false;
  const received = new Set();
  const status = () => ({ confirmed, pending: !!pending, stalled: !!pending && now() - pending.started >= 5000 });
  const notify = () => onStatus(status());
  function transmit(packet) {
    if (!active || !connection.open) return false;
    try {
      // Accept legacy object-based peers while new connections use text only.
      connection.send(connection.serialization === 'raw' ? JSON.stringify(packet) : packet);
      return true;
    } catch { return false; }
  }
  function ping() { pingAt = now(); transmit({ type: 'ping' }); }
  function markConfirmed() { confirmed = true; confirmedAt = now(); failed = false; }
  return {
    status,
    open() { active = true; openedAt = now(); confirmedAt = 0; confirmed = false; failed = false; ping(); notify(); },
    sendState(packet) {
      pending = { packet, started: now(), sentAt: now() };
      transmit(packet); notify();
    },
    receive(raw) {
      if (!active) return;
      const packet = decodePacket(raw);
      if (!packet) return;
      if (packet.type === 'ping') transmit({ type: 'pong' });
      if (packet.type === 'pong') markConfirmed();
      if (packet.type === 'ack') {
        if (pending?.packet.id === packet.id) { const delivered = pending.packet; pending = null; markConfirmed(); onAcknowledged(delivered); }
      }
      if (packet.type === 'state') {
        if (!received.has(packet.id)) {
          onState(packet); received.add(packet.id);
          if (received.size > 300) received.delete(received.values().next().value);
        }
        // Re-ack duplicate deliveries too; the sender may have missed the ack.
        transmit({ type: 'ack', id: packet.id });
      }
      notify();
    },
    pulse() {
      if (!active) return;
      const time = now();
      if (time - pingAt >= 3000) ping();
      if (pending && time - pending.sentAt >= 1500) { pending.sentAt = time; transmit(pending.packet); }
      if (confirmed && time - confirmedAt >= 12000) confirmed = false;
      notify();
      if (!failed && (time - (confirmedAt || openedAt) >= 16000 || (pending && time - pending.started >= 16000))) {
        failed = true; onFailure();
      }
    },
    close() { active = false; pending = null; confirmed = false; }
  };
}
