import { forwardRef, useLayoutEffect, useRef } from 'react';
import { scrollOffsetFor } from '@/lib/chart-scroll';
import { Data } from '@/components/vocale/Primitives';
import type { AnchorPoint } from '@/lib/stats';

/**
 * De staven van blok 1: hoeveel woorden er vast staan, cumulatief per maand.
 *
 * Gemeten staven zijn gevuld, geprojecteerde staven zijn hol — een omtrek zonder
 * vulling. Dat onderscheid is de kern van dit blok: zonder zichtbaar verschil
 * leest een voorspelling als een meting. Het is bewust vórm en geen kleur, want
 * elke kleur in dit systeem betekent al iets (goud is actief, rood is wankel).
 *
 * De lopende maand heet `nu` en staat vol in inkt: dat is het enige harde getal
 * op de strook. De maanden ervóór zijn context en staan in staal.
 *
 * De strook loopt van het eerste woord tot de maand waarin het laatste woord
 * vast is, en dat past zelden in beeld. Wat wél in beeld hoort is `nu` met de
 * eerstvolgende prognose ernaast; de rest is te scrollen.
 */

const PLOT_HEIGHT = 185;
const BAR_WIDTH   = 38;
const BAR_GAP     = 8;  // `gap-2`

export default function AnchorChart({ points }: { points: AnchorPoint[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const nowRef      = useRef<HTMLDivElement>(null);

  const nowIndex    = points.findIndex(p => !p.projected && p.label === 'nu');
  const futureCount = points.length - 1 - nowIndex;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const now      = nowRef.current;
    if (!viewport || !now) return;

    viewport.scrollLeft = scrollOffsetFor({
      anchorLeft:  now.offsetLeft,
      anchorWidth: now.offsetWidth,
      viewport:    viewport.clientWidth,
      content:     viewport.scrollWidth,
      // De tussenruimte is `gap-2`; samen met de staafbreedte de steek.
      pitch:       BAR_WIDTH + BAR_GAP,
      ahead:       futureCount,
    });
  }, [points, futureCount]);

  if (points.length === 0) return null;

  const peak = Math.max(...points.map(p => p.count), 1);

  return (
    // `min-w-0`: de kaart eromheen is een grid, en een grid-item mag standaard
    // niet smaller worden dan zijn inhoud. Zonder dit groeit de kaart mee met de
    // strook — dertig staven breed — in plaats van hem te laten scrollen.
    <div className="min-w-0">
      {/* Negatieve marge: de strook loopt door tot de rand van de kaart, zodat
          zichtbaar is dat er verder gescrold kan worden. */}
      <div
        ref={viewportRef}
        className="-mx-5 overflow-x-auto px-5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max items-end gap-2">
          {points.map((point, i) => (
            <Column
              key={point.month}
              ref={i === nowIndex ? nowRef : undefined}
              point={point}
              peak={peak}
              // Het jaartal alleen waar het omslaat: anders staat `jan` twee
              // keer op de as zonder verschil.
              year={yearMarkOf(points, i)}
            />
          ))}
        </div>
      </div>

      <Data className="mt-1 block text-[11.5px] leading-[1.5]">
        cumulatief
        {futureCount > 0 && ' · open staaf = geprojecteerd'}
      </Data>
    </div>
  );
}

/** Het jaartal onder de eerste staaf van elk kalenderjaar, en anders niets. */
function yearMarkOf(points: AnchorPoint[], i: number): string | undefined {
  const year = points[i].month.slice(0, 4);
  if (i > 0 && points[i - 1].month.slice(0, 4) === year) return undefined;
  return year;
}

// `forwardRef`, want dit draait op React 18: daar komt een `ref` als gewone
// prop niet aan en zou de uitlijning stil niets doen.
const Column = forwardRef<HTMLDivElement, {
  point: AnchorPoint;
  peak:  number;
  year?: string;
}>(({ point, peak, year }, ref) => {
  const now = !point.projected && point.label === 'nu';
  const emphasis = now ? 'font-bold text-ink' : 'text-ink-weak';

  return (
    // `shrink-0`: flex-items krimpen standaard, en dan pletten dertig staven
    // zich in de kaartbreedte in plaats van eruit te lopen — waarmee er ook
    // niets te scrollen valt.
    <div
      ref={ref}
      className="flex shrink-0 flex-col justify-end gap-[6px]"
      style={{ width: BAR_WIDTH }}
    >
      <span className={`text-center font-mono text-[10.5px] tabular-nums ${emphasis}`}>
        {point.count}
      </span>
      <span
        className={
          `block rounded-[4px] ` +
          // Hol voor een projectie, gevuld voor een meting. `nu` is het enige
          // gemeten getal dat vandaag geldt en krijgt daarom de volle inkt.
          (point.projected ? 'border-[1.5px] border-ink bg-transparent'
            : now ? 'bg-ink' : 'bg-steel')
        }
        style={{ height: Math.max(2, (point.count / peak) * PLOT_HEIGHT) }}
      />
      {/* Vaste hoogte, ook zonder jaartal: de kolommen staan met hun onderkant
          uitgelijnd, dus een label van twee regels zou anders zijn eigen staaf
          omhoog duwen en de basislijn van de strook breken. */}
      <span className={`block h-7 text-center font-mono text-[10.5px] leading-[1.25] ${emphasis}`}>
        {point.label}
        {year && <span className="block text-[9px] leading-[1.3] text-ink-weak">{year}</span>}
      </span>
    </div>
  );
});
Column.displayName = 'Column';
