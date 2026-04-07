import React from 'react';
import { Word } from '@/types/word';
import { Check, X, Minus } from 'lucide-react';

type AnswerState = { result: 'correct' | 'almost' | 'wrong'; input: string };

interface ProductionCardProps {
  word: Word;
  typedAnswer: string;
  onTypeAnswer: (v: string) => void;
  answerState: AnswerState | null;
  onSubmit: () => void;
}

export default function ProductionCard({
  word, typedAnswer, onTypeAnswer, answerState, onSubmit,
}: ProductionCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !answerState) onSubmit();
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Vertaal naar het Italiaans
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{word.translation}</h2>
      </div>

      {!answerState ? (
        <div className="space-y-3">
          <input
            type="text"
            value={typedAnswer}
            onChange={e => onTypeAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ het Italiaanse woord..."
            autoFocus
            className="w-full rounded-xl bg-card border border-border px-4 py-3.5 text-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
          />
          <button
            onClick={onSubmit}
            disabled={!typedAnswer.trim()}
            className="w-full gradient-primary rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40 transition-opacity"
          >
            Controleer
          </button>
        </div>
      ) : (
        <ProductionFeedback word={word} answerState={answerState} />
      )}
    </div>
  );
}

function ProductionFeedback({ word, answerState }: { word: Word; answerState: AnswerState }) {
  const { result, input } = answerState;

  const feedbackConfig = {
    correct: { icon: Check, label: 'Goed!', color: 'text-success', bg: 'bg-success/10 border-success/30' },
    almost: { icon: Minus, label: 'Bijna!', color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
    wrong: { icon: X, label: 'Fout', color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30' },
  }[result];

  const FeedbackIcon = feedbackConfig.icon;

  return (
    <div className="space-y-4 animate-slide-up">
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${feedbackConfig.bg}`}>
        <FeedbackIcon className={`h-6 w-6 ${feedbackConfig.color}`} />
        <div>
          <p className={`font-semibold ${feedbackConfig.color}`}>{feedbackConfig.label}</p>
          {result !== 'correct' && (
            <p className="text-sm text-muted-foreground">
              Jouw antwoord: <span className="text-foreground">{input}</span>
            </p>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Correcte spelling</p>
        <p className="text-2xl font-bold text-foreground">{word.original}</p>
      </div>
    </div>
  );
}
