import { describe, it, expect } from 'vitest';
import { MIN_AHEAD_VISIBLE, scrollOffsetFor } from '@/lib/chart-scroll';
import type { ScrollTarget } from '@/lib/chart-scroll';

/** Een strook van `count` staven van 38 px met 8 px ertussen, in een venster van 350. */
function strip(count: number, anchorIndex: number, viewport = 350): ScrollTarget {
  const pitch = 46;
  return {
    anchorLeft:  anchorIndex * pitch,
    anchorWidth: 38,
    viewport,
    content:     count * pitch - 8, // laatste staaf heeft geen tussenruimte
    pitch,
    ahead:       count - 1 - anchorIndex,
  };
}

/** Ligt de ijkstaaf, plus `ahead` staven erna, binnen het venster? */
function visibleAhead(t: ScrollTarget, offset: number): number {
  const right = offset + t.viewport;
  let seen = 0;
  for (let i = 1; i <= t.ahead; i++) {
    const left = t.anchorLeft + i * t.pitch;
    if (left >= offset && left + t.anchorWidth <= right) seen++;
  }
  return seen;
}

describe('scrollOffsetFor', () => {
  it('schuift niet als de hele strook past', () => {
    expect(scrollOffsetFor(strip(5, 2))).toBe(0);
    expect(scrollOffsetFor(strip(7, 6))).toBe(0);
  });

  it('houdt de ijkstaaf binnen het venster bij een lange strook', () => {
    const t = strip(40, 20);
    const offset = scrollOffsetFor(t);
    expect(t.anchorLeft).toBeGreaterThanOrEqual(offset);
    expect(t.anchorLeft + t.anchorWidth).toBeLessThanOrEqual(offset + t.viewport);
  });

  it('laat minstens twee staven ná het ijkpunt zien', () => {
    for (const anchorIndex of [0, 1, 5, 12, 20, 30]) {
      const t = strip(40, anchorIndex);
      expect(visibleAhead(t, scrollOffsetFor(t))).toBeGreaterThanOrEqual(MIN_AHEAD_VISIBLE);
    }
  });

  it('vraagt niet meer staven dan er ná het ijkpunt staan', () => {
    const t = strip(40, 39); // ijkpunt helemaal rechts, niets erna
    const offset = scrollOffsetFor(t);
    expect(offset).toBe(t.content - t.viewport); // tot de rechterrand, niet verder
  });

  it('toont historie links van het ijkpunt zodra die er is', () => {
    const t = strip(40, 20);
    const offset = scrollOffsetFor(t);
    expect(offset).toBeLessThan(t.anchorLeft); // er staat iets links in beeld
    expect(offset).toBeGreaterThan(0);         // en er valt links nog te scrollen
  });

  it('blijft binnen de grenzen van de strook', () => {
    for (const anchorIndex of [0, 3, 19, 39]) {
      const t = strip(40, anchorIndex);
      const offset = scrollOffsetFor(t);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(t.content - t.viewport);
    }
  });

  it('klapt niet om op een venster van nul (nog niet gemeten)', () => {
    expect(scrollOffsetFor({ ...strip(40, 20), viewport: 0, content: 0 })).toBe(0);
  });

  it('schuift verder naarmate het ijkpunt verder naar rechts ligt', () => {
    const offsets = [5, 10, 20, 30].map(i => scrollOffsetFor(strip(40, i)));
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });
});
