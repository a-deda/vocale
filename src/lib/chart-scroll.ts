/**
 * Waar een horizontaal schuivende strook moet staan om het ijkpunt te tonen.
 *
 * Bewust los van het component, in de lijn van `input-medium.ts`: dit is
 * rekenwerk, geen opmaak, en zo blijft het toetsbaar zonder layout — jsdom kent
 * geen breedtes.
 */

/** Zoveel staven ná het ijkpunt moeten hoe dan ook in beeld staan. */
export const MIN_AHEAD_VISIBLE = 2;

/** Waar het ijkpunt bij voorkeur ligt: iets over de helft, historie links. */
const ANCHOR_SHARE = 0.55;

export interface ScrollTarget {
  /** Positie van de ijkstaaf binnen de strook, in px. */
  anchorLeft:  number;
  anchorWidth: number;
  /** Zichtbare breedte van het venster. */
  viewport:    number;
  /** Volle breedte van de strook. */
  content:     number;
  /** Afstand van staaf tot staaf, inclusief tussenruimte. */
  pitch:       number;
  /** Hoeveel staven er ná het ijkpunt staan. */
  ahead:       number;
}

export function scrollOffsetFor({
  anchorLeft, anchorWidth, viewport, content, pitch, ahead,
}: ScrollTarget): number {
  const maxScroll = Math.max(0, content - viewport);
  if (maxScroll === 0) return 0; // alles past; niets te schuiven

  // Voorkeurspositie: het ijkpunt op iets over de helft.
  let offset = anchorLeft - (viewport * ANCHOR_SHARE - anchorWidth / 2);

  // Blijft er dan te weinig ná het ijkpunt over, schuif dan verder op tot dat
  // wel zo is. Meer staven vragen dan er staan heeft geen zin.
  const wanted = Math.min(MIN_AHEAD_VISIBLE, ahead);
  if (wanted > 0) {
    offset = Math.max(offset, anchorLeft + anchorWidth + wanted * pitch - viewport);
  }

  return Math.round(Math.min(maxScroll, Math.max(0, offset)));
}
