import { Data } from '@/components/vocale/Primitives';

/**
 * Eén regel van een liggende staafgrafiek: label, balk, waarde.
 *
 * Twee blokken gebruiken hem — de vorm van de woordenschat en de denktijd — met
 * dezelfde maatvoering maar een andere labelbreedte en balkkleur. Ze delen deze
 * component zodat de twee grafieken niet uit elkaar kunnen groeien.
 *
 * Geen as, geen raster, geen legenda: de waarde staat rechts van zijn eigen balk.
 */

interface MeterRowProps {
  label: string;
  /** 0–1; de breedte van de balk ten opzichte van de grootste in de groep. */
  share: number;
  value: string;
  /**
   * De vulkleur als Tailwind-klasse; standaard inkt. Alleen een andere kleur
   * kiezen waar die kleur al iets betekent — goud is actief, rood is wankel.
   */
  fill?: string;
  /** Mono voor intervallen (`30–90 d`), gewoon voor toestanden (`wankel`). */
  mono?: boolean;
  labelWidth?: number;
  valueWidth?: number;
}

export default function MeterRow({
  label, share, value, fill = 'bg-ink', mono = false,
  labelWidth = 64, valueWidth = 34,
}: MeterRowProps) {
  return (
    <div
      className="grid items-center gap-[10px]"
      style={{ gridTemplateColumns: `${labelWidth}px 1fr ${valueWidth}px` }}
    >
      {mono
        ? <Data className="text-[11.5px]">{label}</Data>
        : <span className="text-[12.5px] text-ink-weak">{label}</span>}

      <span className="flex h-4">
        <span
          className={`rounded-[4px] ${fill}`}
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
      </span>

      <Data className="text-right text-[13px] tabular-nums text-ink">{value}</Data>
    </div>
  );
}
