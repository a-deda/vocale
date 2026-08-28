/**
 * Een tabel volledig ophalen, ook als hij niet in één antwoord past.
 *
 * De REST-API van Supabase geeft per verzoek hooguit `max-rows` rijen terug —
 * standaard duizend — en zegt daar niets over: je krijgt een array van duizend
 * en geen fout. Een gewone `select('*')` is daarmee stil onvolledig zodra een
 * tabel over die grens groeit.
 *
 * Wat dat aanrichtte: `card_fsrs_states` heeft één rij per (woord, oefenvorm).
 * Boven de duizend rijen kwam een willekeurig deel binnen — en zonder `ORDER BY`
 * geeft Postgres de rijen ruwweg in fysieke volgorde, waarbij een bijgewerkte rij
 * naar achteren schuift. Precies de woorden die je gisteren beoordeeld had vielen
 * dus buiten het antwoord. Die woorden laadden zonder voortgang, leken
 * gloednieuw, kwamen opnieuw in de sessie, en de beurt werd als eerste beurt
 * geboekt: terug naar drie dagen, en die reset overschreef de echte
 * geschiedenis.
 *
 * Daarom worden zulke tabellen in pagina's opgehaald, met een vaste sortering
 * (anders kan paginering rijen dubbel of niet teruggeven) en met het totaal dat
 * de database zelf meldt als eindpunt.
 */

/** Hoeveel rijen per verzoek gevraagd worden; de server mag minder geven. */
export const PAGE_SIZE = 1000;

/** Noodrem: bij een server die zich raar gedraagt nooit eindeloos doorvragen. */
const MAX_PAGES = 100;

/** Eén pagina zoals PostgREST hem teruggeeft. */
interface Page<T> {
  data:   T[] | null;
  error:  { message: string; code?: string } | null;
  count?: number | null;
}

/**
 * Bouw en verstuur één pagina. Elke pagina heeft een verse query nodig, vandaar
 * een functie in plaats van een kant-en-klare query.
 */
export type PageFetcher<T> = (from: number, to: number) => PromiseLike<Page<T>>;

export interface FetchAllResult<T> {
  data:  T[] | null;
  error: { message: string; code?: string } | null;
  /**
   * Het aantal rijen dat de database zegt te hebben, of null als hij het niet
   * meldde. Wijkt dit af van `data.length`, dan is het antwoord onvolledig — en
   * dat mag de aanroeper niet negeren.
   */
  total: number | null;
}

export interface FetchAllOptions {
  /** Rijen per verzoek. */
  pageSize?: number;
  /** Stop zodra er zoveel rijen binnen zijn; voor een bewust venster. */
  max?: number;
}

/**
 * Haal alle rijen op die de query oplevert.
 *
 * De teller schuift op met wat er wérkelijk terugkomt, niet met de gevraagde
 * paginagrootte. Staat `max-rows` op de server lager dan `pageSize`, dan blijft
 * dit dus kloppen in plaats van na één korte pagina te stoppen.
 *
 * Er wordt nooit een verzoek gedaan voorbij het gemelde totaal: PostgREST
 * beantwoordt een bereik dat volledig achter de laatste rij ligt met een fout,
 * en dat zou een geslaagde lading alsnog laten mislukken.
 */
export async function fetchAll<T>(
  page: PageFetcher<T>,
  { pageSize = PAGE_SIZE, max = Infinity }: FetchAllOptions = {},
): Promise<FetchAllResult<T>> {
  const rows: T[] = [];
  let total: number | null = null;

  for (let attempt = 0; attempt < MAX_PAGES; attempt++) {
    const want = Math.min(pageSize, max - rows.length);
    if (want <= 0) break;

    const { data, error, count } = await page(rows.length, rows.length + want - 1);
    if (error) return { data: null, error, total };
    if (count != null) total = count;

    if (!data || data.length === 0) break;
    rows.push(...data);

    // Zonder totaal is er geen veilig stopmoment: de aanroeper vroeg geen telling
    // op, dus één pagina is wat er te halen valt.
    if (total === null) break;
    if (rows.length >= total) break;
  }

  return { data: rows, error: null, total };
}

/**
 * Is dit antwoord compleet? Een onvolledige lading is geen fout van de database
 * maar wel een reden om niet verder te rekenen.
 */
export function isComplete<T>(result: FetchAllResult<T>): boolean {
  if (result.error || !result.data) return false;
  if (result.total === null) return true;
  return result.data.length >= result.total;
}
