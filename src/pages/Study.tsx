import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, Minus } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import { getWordsForReview, calculateNextReview, markIntroduced, fuzzyMatch, generateMCOptions, getReviewIntervalText } from '@/lib/srs';
import type { ReviewRating } from '@/lib/srs';
import { Word } from '@/types/word';
import { Progress } from '@/components/ui/progress';

type Phase = 'intro' | 'production';
type AnswerState = null | { result: 'correct' | 'almost' | 'wrong'; input: string };

export default function Study() {
  const navigate = useNavigate();
  const { words, updateWord, updateStreak, addSession } = useStore();
  const [sessionWords] = useState<Word[]>(() => getWordsForReview(words));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedMC, setSelectedMC] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0, startTime: Date.now() });

  const currentWord = sessionWords[currentIndex];
  const progress = sessionWords.length > 0 ? (currentIndex / sessionWords.length) * 100 : 0;

  // Determine phase: new words get intro, everything else gets production
  const phase: Phase = currentWord?.status === 'new' ? 'intro' : 'production';

  // Generate MC options for intro phase (memoized per word)
  const mcOptions = useMemo(() => {
    if (!currentWord || phase !== 'intro') return [];
    return generateMCOptions(currentWord, words);
  }, [currentWord?.id, phase]);

  // Handle multiple choice answer (intro phase)
  const moveToNext = useCallback(() => {
    setAnswerState(null);
    setTypedAnswer('');
    setSelectedMC(null);

    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      addSession({
        date: new Date().toISOString(),
        wordsStudied: sessionWords.length,
        correct: sessionStats.correct,
        incorrect: sessionStats.incorrect,
        duration: Math.round((Date.now() - sessionStats.startTime) / 1000),
      });
      setCurrentIndex(sessionWords.length);
    }
  }, [currentIndex, sessionWords.length, addSession, sessionStats]);

  const handleMCAnswer = useCallback((selected: string) => {
    if (!currentWord || selectedMC !== null) return;
    setSelectedMC(selected);

    setTimeout(async () => {
      const updates = markIntroduced(currentWord);
      await updateWord(currentWord.id, updates);
      moveToNext();
    }, 1200);
  }, [currentWord, selectedMC, updateWord, moveToNext]);

  const handleSubmitAnswer = useCallback(() => {
    if (!currentWord || !typedAnswer.trim()) return;
    const result = fuzzyMatch(typedAnswer, currentWord.original);
    setAnswerState({ result, input: typedAnswer });
  }, [currentWord, typedAnswer]);

  const handleRate = useCallback(async (rating: ReviewRating) => {
    if (!currentWord) return;
    const updates = calculateNextReview(currentWord, rating);
    await updateWord(currentWord.id, updates);
    await updateStreak();

    setSessionStats(prev => ({
      ...prev,
      correct: rating === 'good' ? prev.correct + 1 : prev.correct,
      incorrect: rating !== 'good' ? prev.incorrect + 1 : prev.incorrect,
    }));

    moveToNext();
  }, [currentWord, updateWord, updateStreak, moveToNext]);

  // Empty state
  if (sessionWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-slide-up">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-foreground">Alles bijgewerkt!</h2>
        <p className="text-muted-foreground mt-2">Geen woorden klaar voor herhaling. Kom later terug.</p>
        <button onClick={() => navigate('/')} className="mt-6 gradient-primary rounded-lg px-6 py-2.5 text-sm font-semibold text-primary-foreground">
          Terug naar Dashboard
        </button>
      </div>
    );
  }

  // Session complete
  if (currentIndex >= sessionWords.length) {
    const totalTime = Math.round((Date.now() - sessionStats.startTime) / 1000);
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-slide-up">
        <div className="text-6xl mb-4">⚡</div>
        <h2 className="text-2xl font-bold text-foreground">Sessie Voltooid!</h2>
        <div className="grid grid-cols-3 gap-4 mt-6 w-full max-w-sm">
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{sessionWords.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Woorden</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-success">{sessionStats.correct}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Goed</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Tijd</p>
          </div>
        </div>
        <button onClick={() => navigate('/')} className="mt-6 gradient-primary rounded-lg px-6 py-2.5 text-sm font-semibold text-primary-foreground">
          Terug naar Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-secondary">
            {phase === 'intro' ? 'Introductie' : 'Productie'}
          </span>
          <span className="text-lg font-bold text-foreground">{currentIndex + 1}</span>
          <span className="text-muted-foreground"> / {sessionWords.length}</span>
        </div>
      </div>
      <Progress value={progress} className="h-1.5 mb-6 bg-border" />

      {phase === 'intro' ? (
        <IntroCard
          word={currentWord}
          options={mcOptions}
          selected={selectedMC}
          onSelect={handleMCAnswer}
        />
      ) : (
        <ProductionCard
          word={currentWord}
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          answerState={answerState}
          onSubmit={handleSubmitAnswer}
          onRate={handleRate}
        />
      )}
    </div>
  );
}

// ─── Intro Card (Multiple Choice) ────────────────────────────

function IntroCard({
  word, options, selected, onSelect,
}: {
  word: Word;
  options: string[];
  selected: string | null;
  onSelect: (option: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Show Italian word, translation only after answer */}
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Nieuw woord
        </span>
        <h2 className="text-4xl font-bold text-foreground mt-3">{word.original}</h2>
        {selected !== null && (
          <p className="text-lg text-muted-foreground mt-3">{word.translation}</p>
        )}
      </div>

      {/* Multiple choice */}
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

// ─── Production Card (Typed Input) ───────────────────────────

function ProductionCard({
  word, typedAnswer, onTypeAnswer, answerState, onSubmit, onRate,
}: {
  word: Word;
  typedAnswer: string;
  onTypeAnswer: (v: string) => void;
  answerState: AnswerState;
  onSubmit: () => void;
  onRate: (rating: ReviewRating) => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !answerState) onSubmit();
  };

  return (
    <div className="space-y-6">
      {/* Show Dutch word */}
      <div className="glass-card rounded-2xl p-8 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Vertaal naar het Italiaans
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{word.translation}</h2>
      </div>

      {/* Input */}
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
        <AnswerFeedback word={word} answerState={answerState} onRate={onRate} />
      )}
    </div>
  );
}

// ─── Answer Feedback ─────────────────────────────────────────

function AnswerFeedback({
  word, answerState, onRate,
}: {
  word: Word;
  answerState: NonNullable<AnswerState>;
  onRate: (rating: ReviewRating) => void;
}) {
  const { result, input } = answerState;

  const feedbackConfig = {
    correct: { icon: Check, label: 'Goed!', color: 'text-success', bg: 'bg-success/10 border-success/30' },
    almost: { icon: Minus, label: 'Bijna!', color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
    wrong: { icon: X, label: 'Fout', color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30' },
  }[result];

  const FeedbackIcon = feedbackConfig.icon;

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Result banner */}
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

      {/* Always show correct spelling */}
      <div className="glass-card rounded-xl p-4 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Correcte spelling</p>
        <p className="text-2xl font-bold text-foreground">{word.original}</p>
      </div>

      {/* Rating buttons */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => onRate('good')}
          className="flex flex-col items-center gap-1.5 rounded-xl border p-3 bg-success/10 border-success/30 text-success transition-all hover:scale-105 active:scale-95"
        >
          <Check className="h-5 w-5" />
          <span className="text-xs font-semibold">Goed</span>
          <span className="text-[9px] text-muted-foreground">{getReviewIntervalText('good', word)}</span>
        </button>
        <button
          onClick={() => onRate('almost')}
          className="flex flex-col items-center gap-1.5 rounded-xl border p-3 bg-warning/10 border-warning/30 text-warning transition-all hover:scale-105 active:scale-95"
        >
          <Minus className="h-5 w-5" />
          <span className="text-xs font-semibold">Bijna</span>
          <span className="text-[9px] text-muted-foreground">1 dag</span>
        </button>
        <button
          onClick={() => onRate('wrong')}
          className="flex flex-col items-center gap-1.5 rounded-xl border p-3 bg-destructive/10 border-destructive/30 text-destructive transition-all hover:scale-105 active:scale-95"
        >
          <X className="h-5 w-5" />
          <span className="text-xs font-semibold">Fout</span>
          <span className="text-[9px] text-muted-foreground">1 dag</span>
        </button>
      </div>
    </div>
  );
}
