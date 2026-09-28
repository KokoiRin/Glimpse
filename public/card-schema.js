export const cardId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const required = ['id','type','topic','parent','time','art','title','teaser','action','trialTitle','trial','moreTitle','more','source'];
const allowed = new Set([...required,'version','energy','widget','choices','link','linkLabel']);
export function validateCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw Error('卡片必须是对象');
  if (Object.keys(card).some(key=>!allowed.has(key))) throw Error('卡片包含不支持的字段');
  for (const key of required) if (typeof card[key] !== 'string' || !card[key].trim() || card[key].length > 12000) throw Error(`卡片 ${card.id || '?'} 的 ${key} 无效`);
  if (!cardId.test(card.id) || card.id.length > 100) throw Error('卡片 ID 无效');
  if (!Number.isSafeInteger(card.version) || card.version < 1) throw Error('卡片版本必须为正整数');
  if (!['high','low'].includes(card.energy)) throw Error('卡片强度无效');
  if (!['graph','math','rain','outside','coffee','queue','state'].includes(card.art)) throw Error('不支持的插图类型');
  if (card.widget && !['reachability','queue'].includes(card.widget)) throw Error('不支持的互动类型');
  if (card.widget && card.choices) throw Error('一张卡只能选择一种互动');
  if (card.choices !== undefined && (!Array.isArray(card.choices) || card.choices.length < 1 || card.choices.length > 8 || card.choices.some(c=>!c || typeof c.label !== 'string' || !c.label.trim() || typeof c.reply !== 'string' || !c.reply.trim() || c.label.length > 200 || c.reply.length > 12000))) throw Error('互动选项无效');
  if (card.link !== undefined) {
    let url; try { url = new URL(card.link); } catch { throw Error('来源地址无效'); }
    if (url.protocol !== 'https:' || url.username || url.password || typeof card.linkLabel !== 'string' || !card.linkLabel.trim()) throw Error('来源地址必须是 HTTPS，且提供链接标题');
  }
  return card;
}
export function validateCards(cards) {
  if (!Array.isArray(cards)) throw Error('内容库必须是数组');
  const ids = new Set();
  for (const card of cards) { validateCard(card); if (ids.has(card.id)) throw Error(`卡片 ID 重复：${card.id}`); ids.add(card.id); }
  return cards;
}
export function validateBatch(batch) {
  if (!batch || !Array.isArray(batch.cards) || !Array.isArray(batch.unpublish) || Object.keys(batch).some(k=>!['cards','unpublish'].includes(k))) throw Error('批次格式为 {cards: [], unpublish: []}');
  validateCards(batch.cards);
  const ids = new Set(batch.cards.map(c=>c.id));
  for (const id of batch.unpublish) { if (typeof id !== 'string' || !cardId.test(id) || id.length > 100 || ids.has(id)) throw Error(`下架 ID 无效或重复：${id}`); ids.add(id); }
  if (ids.size === 0 || ids.size > 100) throw Error('每批需要 1 至 100 个操作');
  return batch;
}
