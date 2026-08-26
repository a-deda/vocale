import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import AnchorChart from '@/components/stats/AnchorChart';
import { scrollOffsetFor } from '@/lib/chart-scroll';
import type { AnchorPoint } from '@/lib/stats';

/**
 * Dat de rekenregel klopt bewaakt `chart-scroll.test.ts`. Hier gaat het om de
 * bedrading: komt de uitkomst daadwerkelijk op de scrollcontainer terecht. Dat
 * hangt aan een `forwardRef` en een `useLayoutEffect`, en allebei kunnen stil
 * niets doen — een `ref` als gewone prop komt op React 18 nooit aan.
 */

const BAR = 38, PITCH = 46, VIEWPORT = 350;

function points(history: number, future: number): AnchorPoint[] {
  const out: AnchorPoint[] = [];
  for (let i = 0; i < history; i++) {
    out.push({ month: `2025-${String(i + 1).padStart(2, '0')}`, label: 'jan', count: i, projected: false });
  }
  out.push({ month: '2026-08', label: 'nu', count: history, projected: false });
  for (let i = 0; i < future; i++) {
    out.push({ month: `2026-${String(i + 9).padStart(2, '0')}`, label: 'sep', count: history + i, projected: true });
  }
  return out;
}

/**
 * jsdom doet geen layout: alle breedtes zijn nul en `scrollLeft` blijft staan
 * waar hij stond. Daarom leggen we de geometrie er zelf onder en vangen we de
 * toekenning op.
 */
function stubLayout(total: number) {
  const content = total * PITCH - 8;
  const set = vi.fn();
  const defs = {
    offsetLeft:  { get(this: HTMLElement) { return indexOf(this) * PITCH; }, configurable: true },
    offsetWidth: { get: () => BAR, configurable: true },
    clientWidth: { get: () => VIEWPORT, configurable: true },
    scrollWidth: { get: () => content, configurable: true },
    scrollLeft:  { get: () => 0, set, configurable: true },
  };
  const original = Object.fromEntries(
    Object.keys(defs).map(k => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)]),
  );
  for (const [key, def] of Object.entries(defs)) {
    Object.defineProperty(HTMLElement.prototype, key, def);
  }
  return {
    set,
    content,
    restore: () => {
      for (const [key, def] of Object.entries(original)) {
        if (def) Object.defineProperty(HTMLElement.prototype, key, def);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    },
  };
}

/** Positie van een kolom binnen de strook; `nu` staat op zijn eigen index. */
function indexOf(el: HTMLElement): number {
  const parent = el.parentElement;
  if (!parent) return 0;
  return [...parent.children].indexOf(el);
}

afterEach(cleanup);

describe('AnchorChart — de uitlijning komt op de container terecht', () => {
  it('schuift een lange strook zodat `nu` in beeld staat', () => {
    const p = points(17, 6);
    const layout = stubLayout(p.length);
    try {
      render(<AnchorChart points={p} />);
      expect(layout.set).toHaveBeenCalled();
      const offset = layout.set.mock.calls.at(-1)![0];
      expect(offset).toBe(scrollOffsetFor({
        anchorLeft: 17 * PITCH, anchorWidth: BAR,
        viewport: VIEWPORT, content: layout.content, pitch: PITCH, ahead: 6,
      }));
      expect(offset).toBeGreaterThan(0);
    } finally {
      layout.restore();
    }
  });

  it('schuift niet als de hele strook past', () => {
    const p = points(3, 2);
    const layout = stubLayout(p.length);
    try {
      render(<AnchorChart points={p} />);
      expect(layout.set.mock.calls.at(-1)![0]).toBe(0);
    } finally {
      layout.restore();
    }
  });
});

describe('AnchorChart — wat er op de as staat', () => {
  it('zet het jaartal alleen waar het jaar omslaat', () => {
    const { container } = render(<AnchorChart points={points(17, 6)} />);
    const years = [...container.querySelectorAll('span')]
      .map(s => s.textContent)
      .filter(t => t && /^\d{4}$/.test(t));
    expect(years).toEqual(['2025', '2026']);
  });

  it('noemt de open staaf alleen wanneer er een prognose is', () => {
    const { container: met } = render(<AnchorChart points={points(3, 2)} />);
    expect(met.textContent).toContain('open staaf = geprojecteerd');
    cleanup();
    const { container: zonder } = render(<AnchorChart points={points(3, 0)} />);
    expect(zonder.textContent).not.toContain('open staaf');
  });

  it('rendert niets zonder staven', () => {
    const { container } = render(<AnchorChart points={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
