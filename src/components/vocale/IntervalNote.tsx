import { useEffect, useState } from 'react';

/**
 * Het briefje dat na een goed antwoord op het invoerveld verschijnt: wanneer
 * dit woord terugkomt. Hoe vlotter je antwoordde, hoe verder weg dat ligt.
 *
 * Papier op goud, want het systeem kent geen schaduw — een briefje herken je
 * hier aan de kleur en de lichte scheefstand, niet aan diepte.
 */
export default function IntervalNote({ text, delayMs = 120 }: { text: string; delayMs?: number }) {
  const [shown, setShown] = useState(false);

  // Even wachten, anders vecht het briefje met de goudflits om de aandacht.
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return (
    <div
      aria-live="polite"
      className={
        `pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ` +
        `rounded-key bg-paper px-[10px] py-[6px] text-[13px] font-medium text-ink ` +
        `transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.2,0,0.2,1)] ` +
        (shown
          ? 'translate-y-[-50%] rotate-[-1.5deg] opacity-100'
          : 'translate-y-[calc(-50%+6px)] rotate-[-1.5deg] scale-[0.98] opacity-0')
      }
    >
      {text}
    </div>
  );
}
