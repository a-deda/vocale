import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, VolumeX, Volume2 } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import {
  buildSession, reviewCard, determineGrade, adjustGradeBySpeed,
  emptyFsrsState, MODE_LABELS,
} from '@/lib/fsrs';
import type { FsrsMode, FsrsGrade, FsrsState, QueueItem } from '@/lib/fsrs';
import { fuzzyMatch, fuzzyMatchWithAlternatives, generateMCOptions } from '@/lib/srs';
import { Word } from '@/types/word';
import { formatTranslations } from '@/lib/translation-utils';
import { findSynonymOriginals } from '@/lib/synonyms';
import { Progress } from '@/components/ui/progress';
import IntroCard from '@/components/study/IntroCard';
import ProductionCard from '@/components/study/ProductionCard';
import FlashcardCard from '@/components/study/FlashcardCard';
import ListeningCard from '@/components/study/ListeningCard';

type AnswerState = null | { result: 'correct' | 'almost' | 'wrong'; input: string };

const MAX_SESSION = 20;

export default function Study() {
  const navigate = useNavigate();
  const { words, fsrsStates, upsertFsrsState, addReviewLog, updateStreak, addSession } = useStore();

  const today = new Date().toISOString().split('T')[0];

  // ─── Bouw sessie-wachtrij ───────────────────────────────────────────────
  const [queue, setQueue] = useState<(QueueItem & { word: Word })[]>([]);
  const [initialized, setInitialized]   = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (initialized || words.length === 0) return;

    // Zorg dat elk woord een entry heeft, ook als er nog geen FSRS-state is.
    // Woorden zonder state hebben dueDate=null en komen altijd in de queue.
    const allCardStates: Record<string, Partial<Record<FsrsMode, FsrsState>>> = {};
    for (const w of words) {
      allCardStates[w.id] = fsrsStates[w.id] ?? {};
    }

    const wordMap = new Map(words.map(w => [w.id, w]));
    const items   = buildSession(allCardStates, today, MAX_SESSION);

    // Filter items waarvan het bijbehorende woord bestaat
    const resolved = items
      .map(item => {
        const word = wordMap.get(item.cardId);
        return word ? { ...item, word } : null;
      })
      .filter((x): x is QueueItem & { word: Word } => x !== null);

    setQueue(resolved);
    setInitialized(true);
  }, [words, fsrsStates, initialized, today]);

  // ─── UI-state ───────────────────────────────────────────────────────────
  const [answerState, setAnswerState] = useState<AnswerState>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedMC, setSelectedMC]   = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0, startTime: Date.now() });

  const cardStartTimeRef    = useRef(Date.now());
  const currentIndexRef     = useRef(currentIndex);
  const queueRef            = useRef(queue);
  const sessionStatsRef     = useRef(sessionStats);
  const totalWordsRef       = useRef(0);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { queueRef.current        = queue;        }, [queue]);
  useEffect(() => { sessionStatsRef.current = sessionStats; }, [sessionStats]);

  const [listeningMutedUntil, setListeningMutedUntil] = useState<number | null>(() => {
    const stored = sessionStorage.getItem('listeningMutedUntil');
    if (stored) { const v = parseInt(stored, 10); return v > Date.now() ? v : null; }
    return null;
  });
  const isListeningMuted = listeningMutedUntil !== null && listeningMutedUntil > Date.now();

  const toggleListeningMute = useCallback(() => {
    if (isListeningMuted) {
      setListeningMutedUntil(null);
      sessionStorage.removeItem('listeningMutedUntil');
    } else {
      const until = Date.now() + 30 * 60 * 1000;
      setListeningMutedUntil(until);
      sessionStorage.setItem('listeningMutedUntil', String(until));
    }
  }, [isListeningMuted]);

  // Als luisteren gedempt is, wijk dan uit naar mc (niet typen)
  const effectiveMode = useCallback((item: QueueItem & { word: Word }): FsrsMode => {
    if (item.mode === 'listen_type' && isListeningMuted) return 'mc';
    return item.mode;
  }, [isListeningMuted]);

  const currentItem = queue[currentIndex];
  const mode: FsrsMode = currentItem ? effectiveMode(currentItem) : 'typed_nl_it';

  useEffect(() => {
    if (currentItem) cardStartTimeRef.current = Date.now();
  }, [currentItem?.cardId, mode]);

  const progress = queue.length > 0 ? (currentIndex / queue.length) * 100 : 0;

  const mcOptions = useMemo(() => {
    if (!currentItem || mode !== 'mc') return [];
    return generateMCOptions(currentItem.word, words);
  }, [currentItem?.cardId, mode, words]);

  const synonymOriginals = useMemo(() => {
    if (!currentItem) return [];
    return findSynonymOriginals(currentItem.word, words);
  }, [currentItem?.cardId, words]);

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Sla FSRS-state + log op na een review. */
  const persistReview = useCallback(async (
    item:  QueueItem & { word: Word },
    grade: FsrsGrade,
    usedMode: FsrsMode,
  ) => {
    const existing = fsrsStates[item.cardId]?.[usedMode] ?? emptyFsrsState();
    const { newState, logPartial } = reviewCard(existing, grade, today);
    await upsertFsrsState(item.cardId, usedMode, newState);
    await addReviewLog({ ...logPartial, cardId: item.cardId, mode: usedMode });
    await updateStreak();
  }, [fsrsStates, today, upsertFsrsState, addReviewLog, updateStreak]);

  const moveToNext = useCallback(() => {
    setAnswerState(null);
    setTypedAnswer('');
    setSelectedMC(null);

    const idx = currentIndexRef.current;
    const q   = queueRef.current;

    if (idx < q.length - 1) {
      setCurrentIndex(prev => prev + 1);
      return;
    }

    totalWordsRef.current = q.length;
    void addSession({
      date:         new Date().toISOString(),
      wordsStudied: q.length,
      correct:      sessionStatsRef.current.correct,
      incorrect:    sessionStatsRef.current.incorrect,
      duration:     Math.round((Date.now() - sessionStatsRef.current.startTime) / 1000),
    });
    setCurrentIndex(q.length);
  }, [addSession]);

  // ─── Antwoord-handlers ──────────────────────────────────────────────────

  const handleMCAnswer = useCallback((selected: string) => {
    if (!currentItem || selectedMC !== null) return;
    setSelectedMC(selected);

    setTimeout(() => {
      const correct   = formatTranslations(currentItem.word.translation).replace(/\s*\([^)]+\)/g, '').trim();
      const isCorrect = selected === correct;
      const matchResult = isCorrect ? 'correct' : 'wrong';
      const grade       = determineGrade('mc', matchResult);

      void persistReview(currentItem, grade, currentItem.mode);
      setSessionStats(prev => ({
        ...prev,
        correct:   isCorrect ? prev.correct + 1 : prev.correct,
        incorrect: !isCorrect ? prev.incorrect + 1 : prev.incorrect,
      }));
      moveToNext();
    }, 1200);
  }, [currentItem, selectedMC, persistReview, moveToNext]);

  const handleSubmitAnswer = useCallback(() => {
    if (!currentItem || !typedAnswer.trim()) return;

    const usedMode = effectiveMode(currentItem);
    let matchResult: 'correct' | 'almost' | 'wrong';

    if (usedMode === 'typed_nl_it') {
      // NL → IT: accepteer ook synoniemen
      matchResult = fuzzyMatchWithAlternatives(typedAnswer, currentItem.word.original, synonymOriginals);
    } else if (usedMode === 'typed_it_nl') {
      // IT → NL
      matchResult = fuzzyMatch(typedAnswer, currentItem.word.translation);
    } else {
      // listen_type / fill_blank: exacte IT-spelling
      matchResult = fuzzyMatch(typedAnswer, currentItem.word.original);
    }

    setAnswerState({ result: matchResult, input: typedAnswer });
    const responseMs = Date.now() - cardStartTimeRef.current;

    setTimeout(() => {
      let grade = determineGrade(usedMode, matchResult);
      grade = adjustGradeBySpeed(grade, usedMode, responseMs, currentItem.word.original.length);

      void persistReview(currentItem, grade, usedMode);
      setSessionStats(prev => ({
        ...prev,
        correct:   matchResult === 'correct' ? prev.correct + 1 : prev.correct,
        incorrect: matchResult !== 'correct' ? prev.incorrect + 1 : prev.incorrect,
      }));
      moveToNext();
    }, 1500);
  }, [currentItem, typedAnswer, effectiveMode, synonymOriginals, persistReview, moveToNext]);

  const handleSkip = useCallback(() => {
    if (!currentItem) return;
    setAnswerState({ result: 'wrong', input: '' });

    setTimeout(() => {
      void persistReview(currentItem, 1 /* FORGOT */, currentItem.mode);
      setSessionStats(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      moveToNext();
    }, 1500);
  }, [currentItem, persistReview, moveToNext]);

  const handleFlashcardRate = useCallback((grade: FsrsGrade) => {
    if (!currentItem) return;
    void persistReview(currentItem, grade, 'self_assess');
    setSessionStats(prev => ({
      ...prev,
      correct:   grade >= 3 ? prev.correct + 1 : prev.correct,
      incorrect: grade <  3 ? prev.incorrect + 1 : prev.incorrect,
    }));
    moveToNext();
  }, [currentItem, persistReview, moveToNext]);

  // ─── Leeg / klaar ──────────────────────────────────────────────────────

  if (initialized && queue.length === 0) {
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

  if (currentIndex >= queue.length && queue.length > 0) {
    const totalTime = Math.round((Date.now() - sessionStats.startTime) / 1000);
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-slide-up">
        <div className="text-6xl mb-4">⚡</div>
        <h2 className="text-2xl font-bold text-foreground">Sessie Voltooid!</h2>
        <div className="grid grid-cols-3 gap-4 mt-6 w-full max-w-sm">
          <div className="glass-card rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{totalWordsRef.current}</p>
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

  if (!currentItem) return null;

  // ─── Render oefening ────────────────────────────────────────────────────

  const modeLabel = MODE_LABELS[mode];

  return (
    <div className="max-w-lg mx-auto animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleListeningMute}
            title={isListeningMuted ? 'Luisteroefeningen weer aanzetten' : 'Luisteroefeningen 30 min uitschakelen'}
            className={`p-1.5 rounded-lg transition-colors ${isListeningMuted ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {isListeningMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-secondary">
            {modeLabel}
          </span>
          <span className="text-lg font-bold text-foreground">{currentIndex + 1}</span>
          <span className="text-muted-foreground"> / {queue.length}</span>
        </div>
      </div>
      <Progress value={progress} className="h-1.5 mb-6 bg-border" />

      {mode === 'mc' ? (
        <IntroCard
          word={currentItem.word}
          options={mcOptions}
          selected={selectedMC}
          onSelect={handleMCAnswer}
        />
      ) : mode === 'typed_nl_it' ? (
        <ProductionCard
          word={currentItem.word}
          direction="nl_it"
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          answerState={answerState}
          onSubmit={handleSubmitAnswer}
          onSkip={handleSkip}
          alternatives={synonymOriginals}
        />
      ) : mode === 'typed_it_nl' ? (
        <ProductionCard
          word={currentItem.word}
          direction="it_nl"
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          answerState={answerState}
          onSubmit={handleSubmitAnswer}
          onSkip={handleSkip}
        />
      ) : mode === 'listen_type' ? (
        <ListeningCard
          word={currentItem.word}
          typedAnswer={typedAnswer}
          onTypeAnswer={setTypedAnswer}
          answerState={answerState}
          onSubmit={handleSubmitAnswer}
          onSkip={handleSkip}
        />
      ) : mode === 'self_assess' ? (
        <FlashcardCard
          word={currentItem.word}
          fsrsState={fsrsStates[currentItem.cardId]?.['self_assess'] ?? emptyFsrsState()}
          today={today}
          onRate={handleFlashcardRate}
        />
      ) : null}
    </div>
  );
}
