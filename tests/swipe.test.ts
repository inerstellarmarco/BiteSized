import { describe, expect, it } from "vitest";
import { cardEnterClass, classifySwipe } from "@/lib/swipe";

describe("cardEnterClass", () => {
  it("rises when moving forward and drops when moving back", () => {
    expect(cardEnterClass("next")).toBe("card-rise");
    expect(cardEnterClass("prev")).toBe("card-drop");
  });
});

const shortCard = { scrollTop: 0, clientHeight: 600, scrollHeight: 500 };
const longCardTop = { scrollTop: 0, clientHeight: 400, scrollHeight: 1200 };
const longCardMiddle = { scrollTop: 300, clientHeight: 400, scrollHeight: 1200 };
const longCardEnd = { scrollTop: 800, clientHeight: 400, scrollHeight: 1200 };

describe("classifySwipe", () => {
  it("swipes up to the next card when the card fits on screen", () => {
    expect(classifySwipe({ x: 100, y: 400 }, { x: 102, y: 300 }, shortCard)).toBe("next");
  });

  it("does not skip a long card that is still unread", () => {
    expect(classifySwipe({ x: 100, y: 400 }, { x: 102, y: 300 }, longCardTop)).toBeNull();
    expect(classifySwipe({ x: 100, y: 400 }, { x: 102, y: 300 }, longCardMiddle)).toBeNull();
  });

  it("swipes up to the next card once a long card is read to the end", () => {
    expect(classifySwipe({ x: 100, y: 400 }, { x: 102, y: 300 }, longCardEnd)).toBe("next");
  });

  it("swipes down to the previous card when the card is at the top", () => {
    expect(classifySwipe({ x: 100, y: 300 }, { x: 101, y: 420 }, longCardTop)).toBe("prev");
    expect(classifySwipe({ x: 100, y: 300 }, { x: 101, y: 420 }, { scrollTop: 2, clientHeight: 400, scrollHeight: 1200 })).toBe("prev");
  });

  it("does not go back while the card is scrolled down", () => {
    expect(classifySwipe({ x: 100, y: 300 }, { x: 101, y: 420 }, longCardMiddle)).toBeNull();
  });

  it("ignores short movements", () => {
    expect(classifySwipe({ x: 100, y: 300 }, { x: 100, y: 330 }, shortCard)).toBeNull();
    expect(classifySwipe({ x: 100, y: 300 }, { x: 100, y: 270 }, shortCard)).toBeNull();
  });

  it("ignores mostly horizontal gestures", () => {
    expect(classifySwipe({ x: 100, y: 300 }, { x: 300, y: 340 }, shortCard)).toBeNull();
  });
});
