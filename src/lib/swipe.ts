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

export type CardScroll = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  startScrollTop?: number;
};

export const SWIPE_THRESHOLD_PX = 88;
const EDGE = 4;

// Decides what a finished touch gesture means for the learn deck.
// Swipe up goes to the next card, but ONLY if the card was already at the
// bottom when the touch started (so scrolling down to read the bottom of a card
// never accidentally jumps to the next card) AND the user pulled past the
// intentional swipe threshold. Swipe down goes to the previous card only when
// the gesture started at the very top of the card.
export function classifySwipe(
  start: { x: number; y: number },
  end: { x: number; y: number },
  card: CardScroll,
): SwipeDirection {
  const dy = end.y - start.y;
  const dx = end.x - start.x;
  if (Math.abs(dy) < SWIPE_THRESHOLD_PX) return null;
  if (Math.abs(dy) < Math.abs(dx) * 1.5) return null;

  const startTop = card.startScrollTop ?? card.scrollTop;
  const scrolledDuringTouch = Math.abs(card.scrollTop - startTop) > EDGE;

  if (dy < 0) {
    const startedAtEnd = startTop + card.clientHeight >= card.scrollHeight - EDGE;
    const endedAtEnd = card.scrollTop + card.clientHeight >= card.scrollHeight - EDGE;
    return startedAtEnd && endedAtEnd && !scrolledDuringTouch ? "next" : null;
  }

  const startedAtTop = startTop <= EDGE;
  const endedAtTop = card.scrollTop <= EDGE;
  return startedAtTop && endedAtTop && !scrolledDuringTouch ? "prev" : null;
}

// Damped rubber-band offset (in px) while the user is actively pulling at the
// top or bottom boundary of a card, creating physical friction before release.
export function computeSwipePullOffset(
  dy: number,
  dx: number,
  card: CardScroll,
): number {
  if (Math.abs(dy) < Math.abs(dx) * 1.2) return 0;
  const startTop = card.startScrollTop ?? card.scrollTop;
  if (dy < 0) {
    const atEnd =
      startTop + card.clientHeight >= card.scrollHeight - EDGE &&
      card.scrollTop + card.clientHeight >= card.scrollHeight - EDGE;
    if (!atEnd) return 0;
    return -Math.min(28, Math.round(Math.pow(Math.abs(dy), 0.72)));
  }
  if (dy > 0) {
    const atTop = startTop <= EDGE && card.scrollTop <= EDGE;
    if (!atTop) return 0;
    return Math.min(28, Math.round(Math.pow(dy, 0.72)));
  }
  return 0;
}
