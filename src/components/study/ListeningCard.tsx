import React, { useRef, useEffect, useCallback } from 'react';
import { Word } from '@/types/word';
import { Volume2, Check, X, Minus } from 'lucide-react';
import DiffHighlight from './DiffHighlight';

type AnswerState = { result: 'correct' | 'almost' | 'wrong'; input: string };

interface ListeningCardProps {
  word: Word;
  typedAnswer: string;
  onTypeAnswer: (v: string) => void;
  answerState: AnswerState | null;
  onSubmit: () => void;
  onSkip?: () => void;
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'it-IT';
  utterance.rate = 0.85;
  // Try to find an Italian voice
  const voices = window.speechSynthesis.getVoices();
  const italianVoice = voices.find(v => v.lang.startsWith('it'));
  if (italianVoice) utterance.voice = italianVoice;
  window.speechSynthesis.speak(utterance);
}

export default function ListeningCard({
  word, typedAnswer, onTypeAnswer, answerState, onSubmit, onSkip,
}: ListeningCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-play on mount
  useEffect(() => {
    const play = () => speak(word.original);
    if (window.speechSynthesis.getVoices().length > 0) {
      play();
    } else {
      window.speechSynthesis.onvoiceschanged = play;
    }
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [word.id, word.original]);

  useEffect(() => {
    if (!answerState) {
      const timers = [50, 150, 300].map(d =>
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.click(); }, d)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [word.id, answerState]);

  const handleReplay = useCallback(() => speak(word.original), [word.original]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !answerState) {
      if (typedAnswer.trim()) onSubmit();
      else onSkip?.();
    }
  };

  const hasInput = typedAnswer.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Luister en typ wat je hoort
        </span>
        <button
          onClick={handleReplay}
          className="mt-4 mx-auto flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
        >
          <Volume2 className="h-10 w-10 text-primary" />
        </button>
        <p className="text-xs text-muted-foreground mt-3">Tik om opnieuw af te spelen</p>
      </div>

      {!answerState ? (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={typedAnswer}
            onChange={e => onTypeAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ wat je hoort..."
            autoFocus
            className="w-full rounded-xl bg-card border border-border px-4 py-3.5 text-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
          />
          <button
            onClick={hasInput ? onSubmit : onSkip}
            className={`w-full rounded-xl px-6 py-3 text-sm font-semibold transition-opacity ${
              hasInput
                ? 'gradient-primary text-primary-foreground disabled:opacity-40'
                : 'bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20'
            }`}
          >
            {hasInput ? 'Controleer' : 'Ik weet het niet'}
          </button>
        </div>
      ) : (
        <ListeningFeedback word={word} answerState={answerState} />
      )}
    </div>
  );
}

function ListeningFeedback({ word, answerState }: { word: Word; answerState: AnswerState }) {
  const { result, input } = answerState;
  const config = {
    correct: { icon: Check, label: 'Goed!', color: 'text-success', bg: 'bg-success/10 border-success/30' },
    almost: { icon: Minus, label: 'Bijna!', color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
    wrong: { icon: X, label: 'Fout', color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30' },
  }[result];
  const Icon = config.icon;

  return (
    <div className="space-y-4 animate-slide-up">
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${config.bg}`}>
        <Icon className={`h-6 w-6 ${config.color}`} />
        <div>
          <p className={`font-semibold ${config.color}`}>{config.label}</p>
          {result === 'almost' ? (
            <DiffHighlight input={input} correct={word.original} />
          ) : result === 'wrong' && input && (
            <p className="text-sm text-muted-foreground">
              Jouw antwoord: <span className="text-foreground">{input}</span>
            </p>
          )}
        </div>
      </div>
      <div className="glass-card rounded-xl p-4 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Het woord was</p>
        <p className="text-2xl font-bold text-foreground">{word.original}</p>
        <p className="text-sm text-muted-foreground mt-1">{word.translation}</p>
      </div>
    </div>
  );
}
