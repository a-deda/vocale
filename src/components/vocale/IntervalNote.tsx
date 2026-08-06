import { useEffect, useState } from 'react';

/** Het goud van het palet, als losse kanalen zodat de sterkte kan variëren. */
const ACTIVE_RGB = '209, 156, 29';
/** Ook het kortste interval moet zichtbaar zijn op wit. */
const MIN_ALPHA = 0.18;

/**
 * Het briefje dat na een goed antwoord op het invoerveld verschijnt: wanneer
 * dit woord terugkomt, bondig — `+6 d`, `+4 wk`, `+2 mnd`.
 *
 * Eén kleur in oplopende sterkte, niet twee tinten die in elkaar overlopen:
 * van steel naar goud kom je onvermijdelijk door kaki. Volledig goud valt
 * samen met de verankerdrempel, dus de kleur zegt hoe vast het woord zit.
 *
 * Het systeem kent geen schaduw; een briefje herken je hier aan de kleur en de
 * lichte scheefstand.
 */
export default function IntervalNote({
  text, tone, delayMs = 240,
}: { text: string; tone: number; delayMs?: number }) {
  const [shown, setShown] = useState(false);

  // Even wachten: het veld is nog goud, en daarop zou dit briefje wegvallen.
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  const alpha = MIN_ALPHA + (1 - MIN_ALPHA) * Math.min(1, Math.max(0, tone));

  return (
    <div
      aria-live="polite"
      className={
        `pointer-events-none absolute right-3 top-1/2 rotate-[-1.5deg] ` +
        `rounded-key px-[10px] py-[6px] font-mono text-[13px] text-ink ` +
        `transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.2,0,0.2,1)] ` +
        (shown
          ? 'translate-y-[-50%] opacity-100'
          : 'translate-y-[calc(-50%+6px)] scale-[0.98] opacity-0')
      }
      style={{ backgroundColor: `rgba(${ACTIVE_RGB}, ${alpha.toFixed(3)})` }}
    >
      {text}
    </div>
  );
}
