import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/components/StoreProvider';
import { supabase } from '@/integrations/supabase/client';
import { ANCHOR_DAYS } from '@/lib/fsrs';
import { Data, Screen, Wordmark } from '@/components/vocale/Primitives';

/** Sessiegroottes waaruit je kunt kiezen; de sessie is de eenheid, niet een dagdoel. */
const SESSION_SIZES = [12, 18, 24, 32];

/**
 * Het menu. Woordenbank en toevoegen staan hier — de hamburger is de enige
 * navigatie, dus hij draagt zowel inhoud als instellingen.
 */
export default function Menu() {
  const navigate = useNavigate();
  const { words, stats, fsrsStates, updateStats } = useStore();
  const [name, setName] = useState('');
  const [sizeOpen, setSizeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles').select('display_name').eq('user_id', user.id).maybeSingle();
      setName((data?.display_name || '').trim().split(/\s+/)[0] || '');
    };
    void load();
  }, []);

  const exportWords = () => {
    const payload = words.map(word => ({
      original:    word.original,
      translation: word.translation,
      fsrs:        fsrsStates[word.id] ?? {},
    }));
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `vocale-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /** Import levert regels aan; bevestigen gebeurt op het toevoegscherm zelf. */
  const importWords = async (file: File) => {
    const text = await file.text();
    let lines = '';
    try {
      const parsed = JSON.parse(text);
      lines = (Array.isArray(parsed) ? parsed : [])
        .map((row: { original?: string; translation?: string }) =>
          row.translation ? `${row.original} - ${row.translation}` : String(row.original ?? ''))
        .filter(Boolean)
        .join('\n');
    } catch {
      lines = text; // Geen JSON: behandel het als een kale woordenlijst.
    }
    navigate('/toevoegen', { state: { prefill: lines } });
  };

  return (
    <Screen>
      <div className="mb-8 flex items-center justify-between">
        <Wordmark />
        <button
          onClick={() => navigate(-1)}
          aria-label="Sluiten"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-[17px] text-ink"
        >
          ×
        </button>
      </div>

      <div className="rounded-card bg-card px-5 py-[6px]">
        <Item label="Woordenbank" value={String(words.length)} onClick={() => navigate('/woordenbank')} />
        <Item label="Woorden toevoegen" onClick={() => navigate('/toevoegen')} />
        <Item label="Statistieken" onClick={() => navigate('/statistieken')} />

        <Item
          label="Sessiegrootte"
          value={String(stats.dailyGoal)}
          onClick={() => setSizeOpen(open => !open)}
        />
        {sizeOpen && (
          <div className="flex gap-2 pb-[13px]">
            {SESSION_SIZES.map(size => (
              <button
                key={size}
                onClick={() => { void updateStats({ dailyGoal: size }); setSizeOpen(false); }}
                className={
                  `flex-1 rounded-full py-2 font-mono text-[13px] transition-colors duration-[120ms] ` +
                  `${stats.dailyGoal === size ? 'bg-active text-ink' : 'bg-paper text-ink-weak'}`
                }
              >
                {size}
              </button>
            ))}
          </div>
        )}

        {/* Vast staat vast: de drempel is een eigenschap van het algoritme, niet een voorkeur. */}
        <Item label="Drempel vast" value={`${ANCHOR_DAYS} d`} />
        <Item label="FSRS-parameters" onClick={() => navigate('/fsrs')} />
        <Item label="Importeren" onClick={() => fileRef.current?.click()} />
        <Item label="Exporteren" onClick={exportWords} last />
      </div>

      <div className="mt-4 rounded-card bg-card px-5 py-[6px]">
        <Item label="Account" value={name || 'ingelogd'} onClick={() => navigate('/profiel')} />
        <Item label="Uitloggen" muted onClick={() => void supabase.auth.signOut()} last />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.txt,.csv"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void importWords(file);
          e.target.value = '';
        }}
      />
    </Screen>
  );
}

function Item({
  label, value, onClick, last = false, muted = false,
}: {
  label:    string;
  value?:   string;
  onClick?: () => void;
  last?:    boolean;
  muted?:   boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={
        `flex w-full items-center justify-between py-[17px] text-left ` +
        `${last ? '' : 'border-b border-[rgba(139,158,183,0.45)]'}`
      }
    >
      <span className={`text-[17px] font-medium ${muted ? 'text-ink-weak' : 'text-ink'}`}>{label}</span>
      {value !== undefined
        ? <Data>{value}</Data>
        : <span className="text-ink-weak">→</span>}
    </Tag>
  );
}
