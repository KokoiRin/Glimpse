// One visit owns an ordered deck. Revisiting never draws a different card.
export function createFeed(cards, { energy = 'any', previousId, firstId, random = Math.random } = {}) {
  const deck = cards.filter(card => energy === 'any' || card.energy === 'low');
  for (let index = deck.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  if (deck.length > 1 && deck[0].id === previousId) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
  }
  const requested = deck.findIndex(card => card.id === firstId);
  if (requested > 0) [deck[0], deck[requested]] = [deck[requested], deck[0]];
  let position = 0;
  return {
    get current() { return deck[position]; },
    get hasPrevious() { return position > 0; },
    next() {
      if (position + 1 >= deck.length) return false;
      position++;
      return true;
    },
    previous() {
      if (position === 0) return false;
      position--;
      return true;
    },
  };
}

// Vertical scrolling and small diagonal motions must not turn a card.
export function swipeDirection(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'next' : 'previous';
}
