export type SwipeDirection = "next" | "prev" | null;

// The entrance animation for a card: a card reached by going forward rises
// from below, a card reached by going back drops in from above.
export function cardEnterClass(direction: "next" | "prev"): "card-rise" | "card-drop" {
  return direction === "prev" ? "card-drop" : "card-rise";
}

// Phones start "pull down to refresh" from the page-level scroller. Setting
// overscroll-behavior on a card or wrapper does not stop that, so it has to be set
// on the page root. This sets it and returns a function that puts the old value
// back, so other pages keep their normal behaviour.
export function lockPullToRefresh(root: { style: { overscrollBehaviorY: string } }): () => void {
  const previous = root.style.overscrollBehaviorY;
  root.style.overscrollBehaviorY = "contain";
  return () => {
    root.style.overscrollBehaviorY = previous;
  };
}

export type CardScroll ={ scrollTop: number; clientHeight: number; scrollHeight: number };

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
