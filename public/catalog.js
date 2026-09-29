import { validateCards } from './card-schema.js';
// Cache by audience. A guest must never inherit an account's knowledge cards.
export function createCatalog({storage, fetchCards}) {
  const memory = new Map();
  return {
    async load({userId = null} = {}) {
      const key = `glimpse-catalog-v2:${userId || 'guest'}`;
      const visible = cards => structuredClone(validateCards(cards).filter(card => userId || card.energy === 'low'));
      let cached = memory.get(key);
      if (cached === undefined) {
        try {
          const saved = storage.getItem(key) ?? (!userId ? storage.getItem('glimpse-catalog-v1') : null);
          if (saved !== null) cached = visible(JSON.parse(saved));
        } catch { /* No valid cache yet. */ }
      }
      try {
        const cards = visible(await fetchCards({userId}));
        memory.set(key, cards);
        try { storage.setItem(key, JSON.stringify(cards)); } catch { /* Browsing still works. */ }
        return {cards, stale: false, error: null};
      } catch {
        return {cards: structuredClone(cached ?? []), stale: cached !== undefined, error: '暂时无法获取最新内容，请检查网络后重试。'};
      }
    },
  };
}
