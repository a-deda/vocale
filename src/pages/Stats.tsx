import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import { buildStats, RHYTHM_DAYS, THINK_TIME_MINIMUM } from '@/lib/stats';
import type { Stats as StatsData } from '@/lib/stats';
import { useReviewHistory } from '@/lib/use-review-history';
import { localDateKey } from '@/lib/store';
import { formatSeconds } from '@/lib/vocabulary';
import {
  Button, Data, Hairline, ItalianText, Screen,
} from '@/components/vocale/Primitives';
import AnchorChart from '@/components/stats/AnchorChart';
import MeterRow from '@/components/stats/MeterRow';
import RhythmGrid from '@/components/stats/RhythmGrid';
import { EmptyNote, StatBlock } from '@/components/stats/StatBlock';

/**
 * Statistieken.
 *
 * Het overzicht beantwoordt "wat moet ik nu doen" en kijkt veertien dagen
 * vooruit. Dit scherm beantwoordt de andere vraag — levert dit werk iets op, en
 * waar loopt het vast — en kijkt daarvoor maanden terug én maanden vooruit.
 * Wat op het overzicht staat, staat hier niet nog eens.
 *
 * Dit is het enige scherm van de app dat langer is dan één beeld. Dat mag hier:
 * er is niets te doen, alleen te lezen.
 */
export default function Stats() {
  const navigate = useNavigate();
  const { words, sessions, fsrsStates, reviewLogs, loading } = useStore();
  const today = localDateKey();

  const { recent, crossings } = useReviewHistory(reviewLogs);
  const stats = useMemo(
    () => buildStats(words, fsrsStates, sessions, recent, crossings, today),
    [words, fsrsStates, sessions, recent, crossings, today],
  );

  if (loading) {
    return (
      <Screen>
        <Header onBack={() => navigate(-1)} />
        <Title />
        <div className="grid gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-32 animate-pulse rounded-card bg-card" />
          ))}
        </div>
      </Screen>
    );
  }

  if (words.length === 0) {
    return (
      <Screen>
        <Header onBack={() => navigate(-1)} />
        <Title />
        <div className="grid gap-4">
          <div className="rounded-card bg-card p-5">
            <EmptyNote
              title="Nog geen woorden."
              body="Statistieken beginnen bij het eerste woord dat je toevoegt."
            />
          </div>
          <Button variant="secondary" onClick={() => navigate('/toevoegen')}>
            Woorden toevoegen
          </Button>
          <Footer stats={stats} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header onBack={() => navigate(-1)} />
      <Title />

      <div className="grid gap-4">
        <Anchored stats={stats} />
        <Shape stats={stats} />
        <ThinkTime stats={stats} />
        <Lagging stats={stats} />
        <RhythmBlock stats={stats} />
        <Footer stats={stats} />
      </div>
    </Screen>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="mb-[22px] flex items-center">
      <button onClick={onBack} aria-label="Terug" className="text-[20px] leading-none text-ink">←</button>
    </div>
  );
}

function Title() {
  return (
    <h1 className="mb-[18px] text-[30px] font-bold tracking-[-0.02em] text-ink">statistieken</h1>
  );
}

// ─── 1 · VAST WORDEN ─────────────────────────────────────────────────────────

/**
 * Het leidende blok. "Vast" is de enige succesdefinitie die de app zelf
 * hanteert, en de enige die je niet kunt sturen door harder te klikken: een
 * woord wordt vast door tijd plus correcte herhalingen.
 */
function Anchored({ stats }: { stats: StatsData }) {
  const { points, horizon } = stats.anchored;
  const vast = points.find(p => !p.projected && p.label === 'nu')?.count ?? 0;
  // Niets vast én niets in het vooruitzicht: dan is een rij nulstaven geen
  // grafiek maar ruis, en zegt één zin meer. Zodra er íets te tonen valt — een
  // vast woord of een prognose — hoort de strook er te staan, hoe kort ook.
  const nothingYet = vast === 0 && !points.some(p => p.projected);

  return (
    <StatBlock label="vast worden">
      <div className="grid gap-[6px]">
        <div
          className={
            `font-mono text-[96px] font-bold leading-[0.9] tracking-[-0.04em] tabular-nums ` +
            `${vast === 0 ? 'text-ink-weak' : 'text-ink'}`
          }
        >
          {vast}
        </div>
        <div className="text-[13px] text-ink-weak">woorden vast</div>
      </div>

      {nothingYet ? (
        <EmptyNote
          title="Nog niets gemeten."
          body="Na je eerste sessies staat hier per maand hoeveel woorden vast werden, en wanneer negen van de tien dat zijn."
        />
      ) : (
        <>
          <AnchorChart points={points} />
          {horizon && (
            <div className="grid gap-[6px] pt-1">
              <div className="font-mono text-[30px] font-bold leading-none tracking-[-0.02em] tabular-nums text-ink">
                {horizon}
              </div>
              <div className="text-[12.5px] text-ink-weak">
                in je huidige tempo · geldt zolang je bijblijft
              </div>
            </div>
          )}
        </>
      )}
    </StatBlock>
  );
}

// ─── 2 · DE VORM VAN JE WOORDENSCHAT ─────────────────────────────────────────

function Shape({ stats }: { stats: StatsData }) {
  const { bands, untouched } = stats.shape;
  const peak = Math.max(...bands.map(b => b.count), 1);
  const anyStability = bands.some(b => b.count > 0);

  return (
    <StatBlock label="de vorm van je woordenschat">
      {!anyStability ? (
        <>
          <EmptyNote
            title={`${stats.totalWords} ${stats.totalWords === 1 ? 'woord' : 'woorden'}, geen houdbaarheid.`}
            body="Een woord krijgt houdbaarheid bij het eerste juiste antwoord. De banden vullen zich vanaf dan."
          />
          <MeterRow
            label="nieuw" share={1} value={String(untouched)}
            fill="bg-steel" mono valueWidth={44}
          />
        </>
      ) : (
        <>
          <div className="grid gap-[10px]">
            {bands.map(band => (
              <MeterRow
                key={band.label}
                label={band.label}
                share={band.count / peak}
                value={String(band.count)}
                mono
              />
            ))}
          </div>
          <Data className="text-[11.5px] leading-[1.5]">
            365+ is het plafond · daar blijft alles staan
          </Data>
        </>
      )}
    </StatBlock>
  );
}

// ─── 3 · DENKTIJD ────────────────────────────────────────────────────────────

/**
 * Het enige getal op deze pagina dat over vaardigheid gaat in plaats van over
 * voorraad. Komen vaste woorden in ruim een seconde en actieve in drie, dan is
 * dat het bewijs dat "vast" iets betekent — gemeten aan jezelf.
 */
function ThinkTime({ stats }: { stats: StatsData }) {
  const rows = stats.think;
  const slowest = Math.max(...rows.map(r => r.medianMs), 1);

  // Dezelfde kleuren als de toestandsbalk: wankel rood, actief goud, vast inkt.
  const FILL: Record<string, string> = {
    lapsed:   'bg-lapsed',
    active:   'bg-active',
    anchored: 'bg-ink',
  };

  return (
    <StatBlock label="denktijd">
      {rows.length === 0 ? (
        <EmptyNote
          title={stats.untouched === stats.totalWords
            ? 'De meting begint bij je eerste sessie.'
            : 'De meting begint vandaag.'}
          body={`Hoe lang je over een woord doet wordt vanaf nu bijgehouden. Zichtbaar na ${THINK_TIME_MINIMUM} antwoorden.`}
        />
      ) : (
        <>
          <div className="grid gap-[10px]">
            {rows.map(row => (
              <MeterRow
                key={row.state}
                label={row.label}
                share={row.medianMs / slowest}
                value={formatSeconds(row.medianMs)}
                fill={FILL[row.state]}
                labelWidth={52}
                valueWidth={44}
              />
            ))}
          </div>
          <Data className="text-[11.5px]">tijd tot het eerste teken · mediaan</Data>
        </>
      )}
    </StatBlock>
  );
}

// ─── 4 · WAAR HET BLIJFT HAKEN ───────────────────────────────────────────────

function Lagging({ stats }: { stats: StatsData }) {
  const { lagging, byPartOfSpeech } = stats;

  return (
    <StatBlock label="waar het blijft haken">
      {lagging.length === 0 ? (
        <EmptyNote title="Niets teruggevallen." />
      ) : (
        <div className="grid">
          {lagging.map((word, i) => (
            <div
              key={word.id}
              className={
                `flex items-baseline justify-between ` +
                `${i === 0 ? 'pb-3' : 'border-t border-[rgba(139,158,183,0.45)] py-3'} ` +
                `${i === lagging.length - 1 ? 'pb-0' : ''}`
              }
            >
              <ItalianText className="text-[19px] font-medium">{word.original}</ItalianText>
              <Data className="text-[13px] tabular-nums text-ink">{word.falls}×</Data>
            </div>
          ))}
        </div>
      )}

      {byPartOfSpeech.length > 0 && (
        <div className="grid gap-[6px]">
          <Hairline />
          <div className="pt-2 text-[12.5px] text-ink-weak">
            gemiddelde houdbaarheid per woordsoort
          </div>
          <Data className="text-[12.5px] leading-[1.5] tabular-nums">
            {byPartOfSpeech.map(row => `${row.label} ${row.days} d`).join(' · ')}
          </Data>
        </div>
      )}
    </StatBlock>
  );
}

// ─── 5 · RITME ───────────────────────────────────────────────────────────────

function RhythmBlock({ stats }: { stats: StatsData }) {
  const { rhythm, medianSessionWords } = stats;

  return (
    <StatBlock label={`ritme over ${RHYTHM_DAYS} dagen`}>
      <RhythmGrid rhythm={rhythm} />
      <Data className="text-[11.5px] tabular-nums">
        {rhythm.studied} van {rhythm.days.length} dagen
        {medianSessionWords !== null && ` · mediaan ${medianSessionWords} woorden`}
      </Data>
    </StatBlock>
  );
}

// ─── VOETREGEL ───────────────────────────────────────────────────────────────

/** Context, geen prestatie — en dus onderaan zonder eigen kaart. */
function Footer({ stats }: { stats: StatsData }) {
  const { totalWords, untouched, addedThisMonth } = stats;
  const tail = totalWords > 0 && untouched === totalWords
    ? `${untouched} nieuw`
    : `${addedThisMonth} deze maand`;

  return (
    <Data className="px-1 pt-2 text-[12px] tabular-nums">
      {totalWords} {totalWords === 1 ? 'woord' : 'woorden'}
      {totalWords > 0 && ` · ${tail}`}
    </Data>
  );
}
