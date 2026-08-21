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
 */

const PLOT_HEIGHT = 185;
const BAR_WIDTH   = 38;

export default function AnchorChart({ points }: { points: AnchorPoint[] }) {
  if (points.length === 0) return null;

  const peak = Math.max(...points.map(p => p.count), 1);

  return (
    <div>
      {/* Negatieve marge: de strook loopt door tot de rand van de kaart, zodat
          zichtbaar is dat er verder gescrold kan worden. */}
      <div className="-mx-5 overflow-x-auto px-5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-end gap-2">
          {points.map(point => (
            <Column key={point.month} point={point} peak={peak} />
          ))}
        </div>
      </div>

      <Data className="mt-1 block text-[11.5px] leading-[1.5]">
        cumulatief
        {points.some(p => p.projected) && ' · open staaf = geprojecteerd'}
      </Data>
    </div>
  );
}

function Column({ point, peak }: { point: AnchorPoint; peak: number }) {
  const now = !point.projected && point.label === 'nu';
  const emphasis = now ? 'font-bold text-ink' : 'text-ink-weak';

  return (
    <div className="flex flex-col justify-end gap-[6px]" style={{ width: BAR_WIDTH }}>
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
      <span className={`text-center font-mono text-[10.5px] ${emphasis}`}>
        {point.label}
      </span>
    </div>
  );
}
