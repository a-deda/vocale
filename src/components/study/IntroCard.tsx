import { Word } from '@/types/word';

interface IntroCardProps {
  word: Word;
  options: string[];
  selected: string | null;
  onSelect: (option: string) => void;
}

export default function IntroCard({ word, options, selected, onSelect }: IntroCardProps) {
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Nieuw woord
        </span>
        <h2 className="text-4xl font-bold text-foreground mt-3">{word.original}</h2>
        {selected !== null && (
          <p className="text-lg text-muted-foreground mt-3">{word.translation}</p>
        )}
      </div>

      <div>
        <p className="text-sm text-muted-foreground text-center mb-3">Wat betekent dit woord?</p>
        <div className="grid grid-cols-1 gap-2.5">
          {options.map((opt, i) => {
            const isThis = selected === opt;
            const isRight = opt === word.translation;
            let style = 'bg-card border-border hover:border-primary/40';
            if (selected !== null) {
              if (isRight) style = 'bg-success/10 border-success/50 text-success';
              else if (isThis && !isRight) style = 'bg-destructive/10 border-destructive/50 text-destructive';
              else style = 'bg-card border-border opacity-50';
            }
            return (
              <button
                key={i}
                onClick={() => onSelect(opt)}
                disabled={selected !== null}
                className={`rounded-xl border p-4 text-left text-sm font-medium transition-all ${style}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
