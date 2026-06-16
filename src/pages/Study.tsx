import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, VolumeX, Volume2, Pencil } from 'lucide-react';
import { useStore } from '@/components/StoreProvider';
import {
  buildSession, reviewCard, determineGrade, adjustGradeBySpeed,
  emptyFsrsState, MODE_LABELS, GRADE, FSRS_MODES,
} from '@/lib/fsrs';
import type { FsrsMode, FsrsGrade, FsrsState, QueueItem } from '@/lib/fsrs';
import { fuzzyMatch, fuzzyMatchWithAlternatives, generateMCOptions } from '@/lib/srs';
import { Word } from '@/types/word';
import { formatTranslations, splitTranslations } from '@/lib/translation-utils';
import { findSynonymOriginals } from '@/lib/synonyms';
import { Progress } from '@/components/ui/progress';
import IntroCard from '@/components/study/IntroCard';
import ProductionCard from '@/components/study/ProductionCard';
import FlashcardCard from '@/components/study/FlashcardCard';
import ListeningCard from '@/components/study/ListeningCard';
import FeedbackCorrection from '@/components/study/FeedbackCorrection';

/** Modi waar een fout antwoord pauzeert zodat je kunt corrigeren. */
const CORRECTABLE_MODES: FsrsMode[] = ['mc', 'typed_nl_it', 'typed_it_nl', 'listen_type'];

type AnswerState = null | { result: 'correct' | 'almost' | 'wrong'; input: string };

const MIN_SPACING  = 3; // minimaal aantal kaarten tussen MC en typed-herhaling

export default function Study() {
  const navigate = useNavigate();
  const { words, fsrsStates, upsertFsrsState, addReviewLog, updateStreak, addSession, stats, updateWord } = useStore();

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

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
    const items   = buildSession(allCardStates, today, stats.dailyGoal);

    // Filter items waarvan het bijbehorende woord bestaat
    const resolved = items
      .map(item => {
        const word = wordMap.get(item.cardId);
        return word ? { ...item, word } : null;
      })
      .filter((x): x is QueueItem & { word: Word } => x !== null);

    // Schud de wachtrij zodat MC, typed en listen_type door elkaar staan
    for (let i = resolved.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [resolved[i], resolved[j]] = [resolved[j], resolved[i]];
    }

    setQueue(resolved);
    setInitialized(true);
  }, [words, fsrsStates, initialized, today]);

  // ─── UI-state ───────────────────────────────────────────────────────────
  const [answerState, setAnswerState] = useState<AnswerState>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedMC, setSelectedMC]   = useState<string | null>(null);

  // Gepauzeerd feedbackscherm: bij een niet-correct getypt antwoord wachten we
  // op de gebruiker (kans om het woord te corrigeren) i.p.v. automatisch door
  // te gaan. De beoordeling wordt pas weggeschreven bij 'Verder'.
  const [paused, setPaused]       = useState(false);
  const [corrected, setCorrected] = useState(false);
  const pendingCommitRef = useRef<{
    item: QueueItem & { word: Word };
    usedMode: FsrsMode;
    responseMs: number;
    input: string;
    kind: 'mc' | 'typed';
  } | null>(null);
  const answerStateRef = useRef<AnswerState>(null);
  useEffect(() => { answerStateRef.current = answerState; }, [answerState]);

  // ─── Inline edit ────────────────────────────────────────────────────────
  const [editOpen, setEditOpen]           = useState(false);
  const [editOriginal, setEditOriginal]   = useState('');
  const [editTranslation, setEditTranslation] = useState('');

  const [pendingPool, setPendingPool] = useState<{ item: QueueItem & { word: Word }; addedAtIndex: number }[]>([]);

  const cardStartTimeRef    = useRef(Date.now());
  const sessionStartRef     = useRef(Date.now());
  const currentIndexRef     = useRef(currentIndex);
  const queueRef            = useRef(queue);
  const pendingPoolRef      = useRef(pendingPool);
  const retriedCardsRef     = useRef(new Set<string>());
  // Per uniek woord het laatste resultaat (true = correct). Hieruit leiden we de
  // sessietellers af, zodat 'woorden', 'goed' en 'fout' altijd op elkaar kloppen
  // (één woord telt één keer, ongeacht intro + getypte follow-up + herkansingen).
  const wordResultsRef      = useRef(new Map<string, boolean>());
  const [finalStats, setFinalStats] = useState({ words: 0, correct: 0 });

  useEffect(() => { currentIndexRef.current = currentIndex;  }, [currentIndex]);
  useEffect(() => { queueRef.current        = queue;         }, [queue]);
  useEffect(() => { pendingPoolRef.current  = pendingPool;   }, [pendingPool]);

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

  // ─── Willekeurige betekenis (per kaart) ─────────────────────────────────
  const activeMeaning = useMemo(() => {
    if (!currentItem) return '';
    const parts = splitTranslations(currentItem.word.translation);
    if (parts.length <= 1) return currentItem.word.translation;
    return parts[Math.floor(Math.random() * parts.length)];
  }, [currentItem?.cardId, currentItem?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMeaningRef = useRef(activeMeaning);
  useEffect(() => { activeMeaningRef.current = activeMeaning; }, [activeMeaning]);

  const mcOptions = useMemo(() => {
    if (!currentItem || mode !== 'mc') return [];
    return generateMCOptions({ ...currentItem.word, translation: activeMeaning }, words);
  }, [currentItem?.cardId, mode, words, activeMeaning]);

  const synonymOriginals = useMemo(() => {
    if (!currentItem) return [];
    return findSynonymOriginals(currentItem.word, words);
  }, [currentItem?.cardId, words]);

  // ─── Inline edit handlers ────────────────────────────────────────────────
  const openEdit = useCallback(() => {
    if (!currentItem) return;
    setEditOriginal(currentItem.word.original);
    setEditTranslation(currentItem.word.translation);
    setEditOpen(true);
  }, [currentItem]);

  const saveEdit = useCallback(async () => {
    if (!currentItem) return;
    const original    = editOriginal.trim();
    const translation = editTranslation.trim();
    await updateWord(currentItem.cardId, { original, translation });
    setQueue(prev => prev.map(item =>
      item.cardId === currentItem.cardId
        ? { ...item, word: { ...item.word, original, translation } }
        : item
    ));
    setEditOpen(false);
  }, [currentItem, editOriginal, editTranslation, updateWord]);

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Sla FSRS-state + log op na een review en synchroniseer word-velden. */
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

    // Sync word.status en consecutiveErrors vanuit FSRS-state
    const allStates = { ...(fsrsStates[item.cardId] ?? {}), [usedMode]: newState };
    const maxStability = Math.max(0, ...FSRS_MODES.map(m => allStates[m]?.stability ?? 0));
    const newStatus: Word['status'] =
      maxStability >= 21 ? 'stable' :
      maxStability >= 7  ? 'review' :
      maxStability > 0   ? 'learning' : 'new';
    const newConsecErrors = grade === GRADE.FORGOT
      ? (item.word.consecutiveErrors ?? 0) + 1
      : 0;
    await updateWord(item.cardId, {
      status: newStatus,
      lastReview: newState.lastReviewedAt ?? undefined,
      consecutiveErrors: newConsecErrors,
    });
  }, [fsrsStates, today, upsertFsrsState, addReviewLog, updateStreak, updateWord]);

  /** Leg het (laatste) resultaat per uniek woord vast. */
  const recordResult = useCallback((cardId: string, correct: boolean) => {
    wordResultsRef.current.set(cardId, correct);
  }, []);

  const moveToNext = useCallback(() => {
    setAnswerState(null);
    setTypedAnswer('');
    setSelectedMC(null);
    setPaused(false);
    setCorrected(false);
    pendingCommitRef.current = null;

    const idx  = currentIndexRef.current;
    let   q    = queueRef.current;
    const pool = pendingPoolRef.current;

    // Injecteer één pending item als het lang genoeg gewacht heeft (≥ MIN_SPACING kaarten)
    const atEnd     = idx >= q.length - 1;
    const readyItem = pool.find(p => atEnd || idx - p.addedAtIndex >= MIN_SPACING);
    if (readyItem) {
      const remaining = q.length - 1 - idx;
      const offset    = 1 + (remaining > 1 ? Math.floor(Math.random() * Math.min(3, remaining)) : 0);
      const newQueue  = [...q];
      newQueue.splice(idx + offset, 0, readyItem.item);
      const newPool = pool.filter(p => p !== readyItem);
      queueRef.current       = newQueue;
      pendingPoolRef.current = newPool;
      setQueue(newQueue);
      setPendingPool(newPool);
      q = newQueue;
    }

    if (idx < q.length - 1) {
      setCurrentIndex(prev => prev + 1);
      return;
    }

    // Tellers afleiden uit het per-woord eindresultaat (synchrone ref → geen
    // off-by-one). 'Woorden' = unieke woorden; goed + fout = woorden.
    const results       = wordResultsRef.current;
    const distinctWords = results.size;
    const correct       = [...results.values()].filter(Boolean).length;
    const incorrect     = distinctWords - correct;
    setFinalStats({ words: distinctWords, correct });
    void addSession({
      date:         new Date().toISOString(),
      wordsStudied: distinctWords,
      correct,
      incorrect,
      duration:     Math.round((Date.now() - sessionStartRef.current) / 1000),
    });
    setCurrentIndex(q.length);
  }, [addSession]);

  // ─── Antwoord-handlers ──────────────────────────────────────────────────

  /** Schrijf een meerkeuze-beoordeling weg en ga door. */
  const commitMC = useCallback((item: QueueItem & { word: Word }, isCorrect: boolean) => {
    const grade = determineGrade('mc', isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      // Na een correcte kennismaking ditzelfde woord nog laten typen deze sessie.
      const typedItem: QueueItem & { word: Word } = {
        cardId:  item.cardId,
        mode:    'typed_nl_it',
        dueDate: null,
        word:    item.word,
      };
      const entry = { item: typedItem, addedAtIndex: currentIndexRef.current };
      pendingPoolRef.current = [...pendingPoolRef.current, entry];
      setPendingPool(prev => [...prev, entry]);
    }

    void persistReview(item, grade, item.mode);
    recordResult(item.cardId, isCorrect);
    moveToNext();
  }, [persistReview, recordResult, moveToNext]);

  const handleMCAnswer = useCallback((selected: string) => {
    if (!currentItem || selectedMC !== null) return;
    setSelectedMC(selected);

    const correct   = activeMeaningRef.current.replace(/\s*\([^)]+\)/g, '').trim();
    const isCorrect = selected === correct;

    if (isCorrect) {
      setTimeout(() => commitMC(currentItem, true), 1200);
    } else {
      // Pauzeer zodat het juiste antwoord zichtbaar blijft en je kunt corrigeren.
      setAnswerState({ result: 'wrong', input: selected });
      pendingCommitRef.current = { item: currentItem, usedMode: currentItem.mode, responseMs: 0, input: selected, kind: 'mc' };
      setPaused(true);
    }
  }, [currentItem, selectedMC, commitMC]);

  /** Beoordeel een getypt antwoord tegen het (eventueel aangepaste) woord. */
  const evaluateTyped = useCallback((
    input: string,
    word: Word,
    usedMode: FsrsMode,
  ): 'correct' | 'almost' | 'wrong' => {
    if (usedMode === 'typed_nl_it') {
      // NL → IT: accepteer ook synoniemen
      return fuzzyMatchWithAlternatives(input, word.original, findSynonymOriginals(word, words));
    }
    if (usedMode === 'typed_it_nl' || usedMode === 'mc') {
      // IT → NL en meerkeuze: vergelijk de gekozen/getypte betekenis met de vertaling
      return fuzzyMatch(input, word.translation);
    }
    // listen_type / fill_blank: exacte IT-spelling
    return fuzzyMatch(input, word.original);
  }, [words]);

  /** Schrijf de (eventueel herziene) beoordeling weg en ga door. */
  const commitTyped = useCallback((
    item: QueueItem & { word: Word },
    usedMode: FsrsMode,
    matchResult: 'correct' | 'almost' | 'wrong',
    responseMs: number,
  ) => {
    let grade = determineGrade(usedMode, matchResult);
    grade = adjustGradeBySpeed(grade, usedMode, responseMs, item.word.original.length);

    void persistReview(item, grade, usedMode);
    recordResult(item.cardId, matchResult === 'correct');

    // Na een correcte luister-kennismaking: ditzelfde woord nog in deze sessie
    // laten typen, zodat herkenning meteen wordt omgezet in productie.
    if (usedMode === 'listen_type' && matchResult === 'correct') {
      const typedItem: QueueItem & { word: Word } = {
        cardId:  item.cardId,
        mode:    'typed_nl_it',
        dueDate: null,
        word:    item.word,
      };
      const entry = { item: typedItem, addedAtIndex: currentIndexRef.current };
      pendingPoolRef.current = [...pendingPoolRef.current, entry];
      setPendingPool(prev => [...prev, entry]);
    }

    // Bij fout: één herkansing later in de sessie
    const retryKey = item.cardId + usedMode;
    if (matchResult === 'wrong' && !retriedCardsRef.current.has(retryKey)) {
      retriedCardsRef.current.add(retryKey);
      const entry = { item, addedAtIndex: currentIndexRef.current };
      pendingPoolRef.current = [...pendingPoolRef.current, entry];
      setPendingPool(prev => [...prev, entry]);
    }

    moveToNext();
  }, [persistReview, recordResult, moveToNext]);

  const handleSubmitAnswer = useCallback(() => {
    if (!currentItem || !typedAnswer.trim()) return;

    const usedMode    = effectiveMode(currentItem);
    const matchResult = evaluateTyped(typedAnswer, currentItem.word, usedMode);
    const responseMs  = Date.now() - cardStartTimeRef.current;

    setAnswerState({ result: matchResult, input: typedAnswer });

    if (matchResult === 'correct') {
      setTimeout(() => commitTyped(currentItem, usedMode, matchResult, responseMs), 1500);
    } else {
      // Pauzeer: geef de kans om een fout opgeslagen woord te corrigeren.
      pendingCommitRef.current = { item: currentItem, usedMode, responseMs, input: typedAnswer, kind: 'typed' };
      setPaused(true);
    }
  }, [currentItem, typedAnswer, effectiveMode, evaluateTyped, commitTyped]);

  const handleSkip = useCallback(() => {
    if (!currentItem) return;
    const usedMode = effectiveMode(currentItem);
    setAnswerState({ result: 'wrong', input: '' });
    pendingCommitRef.current = { item: currentItem, usedMode, responseMs: 0, input: '', kind: 'typed' };
    setPaused(true);
  }, [currentItem, effectiveMode]);

  /** 'Verder' op het gepauzeerde feedbackscherm: commit de huidige beoordeling. */
  const handleContinue = useCallback(() => {
    const pc = pendingCommitRef.current;
    if (!pc) return;
    const result = answerStateRef.current?.result ?? 'wrong';
    if (pc.kind === 'mc') commitMC(pc.item, result === 'correct');
    else commitTyped(pc.item, pc.usedMode, result, pc.responseMs);
  }, [commitMC, commitTyped]);

  /** 'Toch goed rekenen': overschrijf de beoordeling naar correct en ga door. */
  const handleMarkCorrect = useCallback(() => {
    const pc = pendingCommitRef.current;
    if (!pc) return;
    if (pc.kind === 'mc') commitMC(pc.item, true);
    else commitTyped(pc.item, pc.usedMode, 'correct', pc.responseMs);
  }, [commitMC, commitTyped]);

  /** Sla een correctie op en herbeoordeel het lopende antwoord meteen. */
  const handleSaveCorrection = useCallback((original: string, translation: string) => {
    const pc = pendingCommitRef.current;
    if (!pc || !original || !translation) return;

    void updateWord(pc.item.cardId, { original, translation });
    setQueue(prev => prev.map(item =>
      item.cardId === pc.item.cardId
        ? { ...item, word: { ...item.word, original, translation } }
        : item
    ));

    const updatedItem = { ...pc.item, word: { ...pc.item.word, original, translation } };
    pendingCommitRef.current = { ...pc, item: updatedItem };

    // Herbeoordeel met de nieuwe woordgegevens.
    const newResult = evaluateTyped(pc.input, updatedItem.word, pc.usedMode);
    setAnswerState(prev => prev ? { ...prev, result: newResult } : prev);
    setCorrected(true);
  }, [updateWord, evaluateTyped]);

  const handleFlashcardRate = useCallback((grade: FsrsGrade) => {
    if (!currentItem) return;
    void persistReview(currentItem, grade, 'self_assess');
    recordResult(currentItem.cardId, grade >= 3);
    moveToNext();
  }, [currentItem, persistReview, recordResult, moveToNext]);

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
    const totalTime = Math.round((Date.now() - sessionStartRef.current) / 1000);
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-slide-up">
        <div className="text-6xl mb-4">⚡</div>
        <h2 className="text-2xl font-bold text-foreground">Sessie Voltooid!</h2>
        <div className="grid grid-cols-3 gap-3 mt-6 w-full max-w-sm">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{finalStats.words}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Woorden</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-success">{finalStats.correct}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Goed</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tijd</p>
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

  // Word met de actieve betekenis (voor MC en productie nl→it)
  const displayWord = currentItem
    ? { ...currentItem.word, translation: activeMeaning }
    : null;

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
          <button
            onClick={openEdit}
            title="Woord aanpassen"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-secondary">
            {modeLabel}
          </span>
          <span className="text-lg font-bold text-foreground">{currentIndex + 1}</span>
          <span className="text-muted-foreground"> / {queue.length}</span>
        </div>
      </div>
      <Progress value={progress} className="h-1.5 mb-6 bg-border" />

      {mode === 'mc' && displayWord ? (
        <IntroCard
          word={displayWord}
          options={mcOptions}
          selected={selectedMC}
          onSelect={handleMCAnswer}
        />
      ) : mode === 'typed_nl_it' && displayWord ? (
        <ProductionCard
          word={displayWord}
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

      {/* Correctie op het feedbackmoment (meerkeuze / getypte / luister-kaarten) */}
      {paused && currentItem && answerState && CORRECTABLE_MODES.includes(mode) && (
        <FeedbackCorrection
          word={currentItem.word}
          input={answerState.input}
          mode={mode as 'mc' | 'typed_nl_it' | 'typed_it_nl' | 'listen_type'}
          result={answerState.result}
          corrected={corrected}
          onSave={handleSaveCorrection}
          onMarkCorrect={handleMarkCorrect}
          onContinue={handleContinue}
        />
      )}

      {/* Inline edit overlay */}
      {editOpen && currentItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Woord aanpassen</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Italiaans</label>
                <input
                  value={editOriginal}
                  onChange={e => setEditOriginal(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nederlands</label>
                <input
                  value={editTranslation}
                  onChange={e => setEditTranslation(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setEditOpen(false)}
                className="flex-1 rounded-lg bg-secondary text-secondary-foreground px-4 py-2 text-sm font-medium"
              >
                Annuleren
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
              >
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
