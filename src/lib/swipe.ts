export type SwipeDirection = "next" | "prev" | null;

export type CardScroll = { scrollTop: number; clientHeight: number; scrollHeight: number };

const MIN_DISTANCE = 56;
const EDGE = 4;

// Decides what a finished touch gesture means for the learn deck.
// Swipe up goes to the next card, but only once the card has been read to its
// end; before that the swipe just scrolls the text. Swipe down goes to the
// previous card, but only when the card is scrolled to the top.
export function classifySwipe(start: { x: number; y: number }, end: { x: number; y: number }, card: CardScroll): SwipeDirection {
  const dy = end.y - start.y;
  const dx = end.x - start.x;
  if (Math.abs(dy) < MIN_DISTANCE) return null;
  if (Math.abs(dy) < Math.abs(dx) * 1.2) return null;
  if (dy < 0) {
    const atEnd = card.scrollTop + card.clientHeight >= card.scrollHeight - EDGE;
    return atEnd ? "next" : null;
  }
  return card.scrollTop <= EDGE ? "prev" : null;
}
