import { describe, it, expect } from 'vitest';
import { fetchAll, isComplete } from '@/lib/fetch-all';

/**
 * Tests voor het volledig ophalen van een tabel.
 *
 * Achtergrond: de app las `card_fsrs_states` met één kale select. Supabase geeft
 * per verzoek hooguit `max-rows` rijen terug zonder dat te melden, dus boven de
 * duizend states kwam een willekeurig deel binnen — en de woorden die daarbuiten
 * vielen leken gloednieuw en verloren hun geschiedenis bij de eerstvolgende
 * beurt.
 */

interface Row { i: number }

/**
 * Een nagebootste PostgREST: hij levert nooit meer dan `maxRows` per verzoek,
 * ongeacht welk bereik je vraagt. Precies het gedrag dat de fout veroorzaakte.
 */
function server(total: number, maxRows = 1000) {
  const requests: [number, number][] = [];
  const all: Row[] = Array.from({ length: total }, (_, i) => ({ i }));

  return {
    requests,
    page: (from: number, to: number) => {
      requests.push([from, to]);
      const end = Math.min(to + 1, from + maxRows);
      return Promise.resolve({ data: all.slice(from, end), error: null, count: total });
    },
  };
}

describe('fetchAll', () => {
  it('haalt in één verzoek op wat in één pagina past', async () => {
    const s = server(120);
    const result = await fetchAll<Row>(s.page);

    expect(result.data).toHaveLength(120);
    expect(s.requests).toEqual([[0, 999]]);
    expect(isComplete(result)).toBe(true);
  });

  it('haalt alles op als de tabel groter is dan één pagina', async () => {
    const s = server(2500);
    const result = await fetchAll<Row>(s.page);

    expect(result.data).toHaveLength(2500);
    expect(result.data?.[2499]).toEqual({ i: 2499 });
    expect(s.requests).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(isComplete(result)).toBe(true);
  });

  it('blijft compleet als de server minder geeft dan gevraagd', async () => {
    // Staat `max-rows` op de server lager dan onze paginagrootte, dan is elke
    // pagina kort. Zou een korte pagina als "einde" gelden, dan bleef het bij
    // die eerste 400 — precies de stille afkapping die we bestrijden.
    const s = server(1500, 400);
    const result = await fetchAll<Row>(s.page);

    expect(result.data).toHaveLength(1500);
    expect(isComplete(result)).toBe(true);
  });

  it('vraagt nooit een bereik voorbij de laatste rij', async () => {
    const s = server(2000);
    await fetchAll<Row>(s.page);

    expect(s.requests).toEqual([[0, 999], [1000, 1999]]);
  });

  it('stopt bij een bewust venster en vraagt niet verder', async () => {
    const s = server(9000);
    const result = await fetchAll<Row>(s.page, { max: 1500 });

    expect(result.data).toHaveLength(1500);
    expect(s.requests).toEqual([[0, 999], [1000, 1499]]);
  });

  it('geeft de fout door zodra een pagina mislukt', async () => {
    const requests: [number, number][] = [];
    const result = await fetchAll<Row>((from, to) => {
      requests.push([from, to]);
      if (from === 0) {
        return Promise.resolve({
          data: Array.from({ length: 1000 }, (_, i) => ({ i })),
          error: null,
          count: 2000,
        });
      }
      return Promise.resolve({ data: null, error: { message: 'offline' }, count: null });
    });

    expect(result.error?.message).toBe('offline');
    expect(result.data).toBeNull();
    expect(isComplete(result)).toBe(false);
    expect(requests).toHaveLength(2);
  });

  it('een lege tabel kost één verzoek', async () => {
    const s = server(0);
    const result = await fetchAll<Row>(s.page);

    expect(result.data).toEqual([]);
    expect(s.requests).toHaveLength(1);
    expect(isComplete(result)).toBe(true);
  });

  it('houdt het bij één pagina als de server geen telling meegeeft', async () => {
    const requests: [number, number][] = [];
    const result = await fetchAll<Row>((from, to) => {
      requests.push([from, to]);
      return Promise.resolve({
        data: Array.from({ length: 1000 }, (_, i) => ({ i: from + i })),
        error: null,
      });
    });

    expect(requests).toHaveLength(1);
    expect(result.total).toBeNull();
  });
});
