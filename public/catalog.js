import { validateCards } from './card-schema.js';
const KEY = 'glimpse-catalog-v1';
export function createCatalog({storage, fetchCards}) {
  let cached;
  try { cached = validateCards(JSON.parse(storage.getItem(KEY))); } catch { /* No valid cache yet. */ }
  return {
    async load() {
      try {
        const cards = structuredClone(validateCards(await fetchCards()));
        cached = cards;
        try { storage.setItem(KEY, JSON.stringify(cards)); } catch { /* Browsing still works. */ }
        return { cards, stale: false, error: null };
      } catch {
        return { cards: structuredClone(cached ?? []), stale: cached !== undefined, error: '暂时无法获取最新内容，请检查网络后重试。' };
      }
    },
  };
}
