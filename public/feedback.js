// Explicit opinions are retained separately from the bounded interaction log.
// Opening a card is evidence of opening only; it never becomes a positive rating.
export function createFeedback(storage, key = 'glimpse-records-v1') {
  let records = Object.create(null);
  let available = true;
  try {
    const saved = JSON.parse(storage.getItem(key) || '{}');
    for (const [id, row] of Object.entries(saved || {})) {
      if (!/^[a-z0-9-]+$/.test(id) || !row || typeof row !== 'object') continue;
      records[id] = {
        id, title: String(row.title || '').slice(0, 200), topic: String(row.topic || '').slice(0, 80),
        parent: String(row.parent || '').slice(0, 200), version: Number(row.version) || 1,
        opens: Number.isFinite(row.opens) ? Math.max(0, row.opens) : 0,
        reaction: ['like', 'dislike'].includes(row.reaction) ? row.reaction : null,
        lastOpenedAt: typeof row.lastOpenedAt === 'string' ? row.lastOpenedAt : null,
        ratedAt: typeof row.ratedAt === 'string' ? row.ratedAt : null,
        seenAt: typeof row.seenAt === 'string' ? row.seenAt : (row.lastOpenedAt || row.ratedAt || null),
      };
    }
  } catch { available = false; }
  function save() {
    try { storage.setItem(key, JSON.stringify(records)); available = true; }
    catch { available = false; }
  }
  function entry(card) {
    const old = records[card.id] || { opens: 0, reaction: null, lastOpenedAt: null, ratedAt: null, seenAt: null };
    return records[card.id] = { ...old, id: card.id, title: card.title, topic: card.topic, parent: card.parent, version: card.version };
  }
  return {
    get available() { return available; },
    get(id) { return records[id] ? { ...records[id] } : undefined; },
    all() { return Object.values(records).map(row => ({ ...row })); },
    see(card, at = new Date().toISOString()) { const row = entry(card); if (!row.seenAt) { row.seenAt = at; save(); } },
    open(card) { const row = entry(card); row.opens++; row.lastOpenedAt = new Date().toISOString(); row.seenAt ||= row.lastOpenedAt; save(); },
    rate(card, reaction) {
      if (![null, 'like', 'dislike'].includes(reaction)) throw new Error('Unknown reaction');
      const row = entry(card); row.reaction = reaction; row.ratedAt = new Date().toISOString(); row.seenAt ||= row.ratedAt; save();
    },
    clear() {
      records = Object.create(null);
      try { storage.removeItem(key); available = true; } catch { available = false; }
    },
  };
}
