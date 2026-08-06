/**
 * Waarmee typt iemand op dit moment?
 *
 * Bewust los van `fsrs.ts`, zodat de rekenlaag geen DOM aanraakt en zuiver
 * testbaar blijft.
 */
export type InputMedium = 'touch' | 'keyboard';

/**
 * `(pointer: coarse)` meet wat er werkelijk toe doet — een schermtoetsenbord
 * tegenover een fysiek toetsenbord. Vensterbreedte zou het verkeerde signaal
 * zijn: een smal bureaubladvenster is nog steeds een fysiek toetsenbord, en
 * een tablet in landschap is dat niet.
 *
 * Zonder `matchMedia` (server, oude omgeving) gaan we uit van een toetsenbord;
 * dat is het krappere budget en dus de behoudende aanname.
 */
export function detectInputMedium(): InputMedium {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'keyboard';
  }
  return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
}
