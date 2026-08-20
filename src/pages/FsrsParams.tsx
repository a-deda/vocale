import { useNavigate } from 'react-router-dom';
import {
  ANCHOR_DAYS, DESIRED_RETENTION, LAPSED_RETRIEVABILITY, MAX_INTERVAL_DAYS,
  SPEED_SWING, THINK_FAST_MS, THINK_NEUTRAL_MS, THINK_SLOW_MS, W,
} from '@/lib/fsrs';
import { Data, Label, Screen } from '@/components/vocale/Primitives';

/**
 * De parameters waarmee het algoritme rekent, uitgeschreven. Het algoritme is
 * zichtbaar, niet verborgen — maar de gewichten zijn geijkt, dus niet te wijzigen.
 */
export default function FsrsParams() {
  const navigate = useNavigate();

  return (
    <Screen>
      <div className="mb-[22px] flex items-center justify-between">
        <button onClick={() => navigate('/menu')} aria-label="Terug" className="text-[20px] leading-none text-ink">←</button>
        <Data className="text-[13px]">FSRS-5</Data>
      </div>

      <h1 className="mb-[18px] text-[30px] font-bold tracking-[-0.02em] text-ink">FSRS-parameters</h1>

      <div className="rounded-card bg-card px-5 py-[6px]">
        <Line label="gewenste retentie" value={`${Math.round(DESIRED_RETENTION * 100)}%`} />
        <Line label="drempel vervallen" value={`${Math.round(LAPSED_RETRIEVABILITY * 100)}%`} />
        <Line label="drempel vast" value={`${ANCHOR_DAYS} d`} />
        <Line label="langste interval" value={`${MAX_INTERVAL_DAYS} d`} last />
      </div>

      <Label className="mb-[10px] mt-[26px]">denktijd · bijstelling</Label>
      <div className="rounded-card bg-card px-5 py-[6px]">
        <Line label="moeiteloos tot" value={`${THINK_FAST_MS / 1000} s`} />
        <Line label="neutraal vanaf" value={`${THINK_NEUTRAL_MS / 1000} s`} />
        <Line label="met moeite vanaf" value={`${THINK_SLOW_MS / 1000} s`} />
        <Line label="grootste zwaai" value={`± ${String(SPEED_SWING).replace('.', ',')}`} last />
      </div>

      <p className="mt-[14px] text-[15px] leading-[1.45] text-ink-weak">
        Denktijd is de tijd tot je eerste toetsaanslag; tikken telt niet mee. Hij
        verschuift de beoordeling hooguit met de zwaai rond 'goed', naar boven én
        naar beneden. Bij de allereerste beurt op een woord telt hij niet mee —
        die beurt zet het startpunt, en daar is één keer antwoorden te weinig
        bewijs voor.
      </p>

      <Label className="mb-[10px] mt-[26px]">gewichten · w0–w18</Label>
      <div className="rounded-card bg-card p-5">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          {W.map((weight, i) => (
            <div key={i} className="flex justify-between">
              <Data>w{i}</Data>
              <Data className="text-ink">{weight}</Data>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-[26px] text-[15px] leading-[1.45] text-ink-weak">
        Deze gewichten zijn de geijkte standaardwaarden van FSRS-5. Ze worden nog
        niet op jouw eigen review-geschiedenis herberekend.
      </p>
    </Screen>
  );
}

function Line({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex justify-between py-[17px] ${last ? '' : 'border-b border-[rgba(139,158,183,0.45)]'}`}>
      <span className="text-[17px] font-medium text-ink">{label}</span>
      <Data>{value}</Data>
    </div>
  );
}
