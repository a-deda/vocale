import { Word } from '@/types/word';
import { Check, X, Minus } from 'lucide-react';
import type { ReviewRating } from '@/lib/srs';
import { getReviewIntervalText } from '@/lib/srs';

interface FlashcardCardProps {
  word: Word;
  onRate: (rating: ReviewRating) => void;
}

export default function FlashcardCard({ word, onRate }: FlashcardCardProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Ken je dit woord?
        </span>
        <h2 className="text-4xl font-bold text-foreground mt-3">{word.original}</h2>
        {revealed && (
          <p className="text-lg text-muted-foreground mt-3 animate-slide-up">{word.translation}</p>
        )}
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full gradient-primary rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Toon antwoord
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2 animate-slide-up">
          <button
            onClick={() => onRate('wrong')}
            className="flex flex-col items-center gap-1.5 rounded-xl border p-3 bg-destructive/10 border-destructive/30 text-destructive transition-all hover:scale-105 active:scale-95"
          >
            <X className="h-5 w-5" />
            <span className="text-xs font-semibold">Opnieuw</span>
            <span className="text-[9px] text-muted-foreground">1 dag</span>
          </button>
          <button
            onClick={() => onRate('hard')}
            className="flex flex-col items-center gap-1.5 rounded-xl border p-3 bg-warning/10 border-warning/30 text-warning transition-all hover:scale-105 active:scale-95"
          >
            <Minus className="h-5 w-5" />
            <span className="text-xs font-semibold">Moeilijk</span>
            <span className="text-[9px] text-muted-foreground">{getReviewIntervalText('hard', word)}</span>
          </button>
          <button
            onClick={() => onRate('good')}
            className="flex flex-col items-center gap-1.5 rounded-xl border p-3 bg-success/10 border-success/30 text-success transition-all hover:scale-105 active:scale-95"
          >
            <Check className="h-5 w-5" />
            <span className="text-xs font-semibold">Goed</span>
            <span className="text-[9px] text-muted-foreground">{getReviewIntervalText('good', word)}</span>
          </button>
          <button
            onClick={() => onRate('easy')}
            className="flex flex-col items-center gap-1.5 rounded-xl border p-3 bg-primary/10 border-primary/30 text-primary transition-all hover:scale-105 active:scale-95"
          >
            <Check className="h-5 w-5" />
            <span className="text-xs font-semibold">Makkelijk</span>
            <span className="text-[9px] text-muted-foreground">{getReviewIntervalText('easy', word)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
