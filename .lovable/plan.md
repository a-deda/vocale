

## Plan: Studieflow verbeteren

### Probleem
1. Na introductie (MC) worden woorden pas morgen weer getoond — alsof je ze al kent
2. Bij het typen moet je handmatig beoordelen (goed/bijna/fout), terwijl het systeem dat al weet
3. Er is geen aparte flashcard-modus met zelfbeoordeling

### Nieuwe studieflow

```text
Sessie-opbouw:
1. INTRO (MC, IT→NL) — voor 'new' woorden
   → Na intro: woord wordt 'learning', nextReview = NU (niet morgen)
   → Woord komt later in dezelfde sessie terug als productie

2. PRODUCTIE (typen, NL→IT) — voor 'learning' woorden
   → Fuzzy match bepaalt automatisch de rating
   → correct = 'good', almost = 'almost', wrong = 'wrong'
   → Feedback + correcte spelling getoond, dan automatisch door (1.5s)
   → Geen handmatige rating-knoppen meer

3. FLASHCARD (zelfbeoordeling) — voor 'review' en 'stable' woorden
   → Italiaans woord getoond, gebruiker onthult vertaling
   → 4 rating-knoppen met SRS-intervallen:
     - Opnieuw (reset → 1 dag, EF -0.2)
     - Moeilijk (interval × 1.2, EF -0.15)  
     - Goed (interval × EF, EF +0.1)
     - Makkelijk (interval × EF × 1.3, EF +0.15)
```

### Technische wijzigingen

**`src/lib/srs.ts`**
- `ReviewRating` uitbreiden met `'easy'` en `'hard'`
- `calculateNextReview` aanpassen: 'hard' krijgt `interval × 1.2` (niet reset), 'easy' krijgt bonus `× 1.3`
- `markIntroduced` aanpassen: `nextReview = now()` in plaats van +1 dag
- `getWordsForReview` aanpassen: introduced woorden direct opnieuw ophalen in dezelfde sessie
- Max interval toevoegen (bijv. 180 dagen) om te voorkomen dat woorden te lang wegblijven

**`src/pages/Study.tsx`**
- Phase uitbreiden: `'intro' | 'production' | 'flashcard'`
- Phase bepaling: `new` → intro, `learning` → production, `review`/`stable` → flashcard
- **Production**: na fuzzy match automatisch `calculateNextReview` aanroepen met het resultaat, feedback tonen, na 1.5s doorgaan — geen rating-knoppen
- **Flashcard component** toevoegen: woord tonen → "Toon antwoord" knop → vertaling onthullen → 4 rating-knoppen met voorspeld interval
- Sessie-queue dynamisch maken: na intro worden woorden opnieuw in de queue gezet voor productie

**`src/types/word.ts`**
- `Difficulty` type updaten naar de 4 nieuwe categorieën

### SRS-intervallen overzicht

```text
Rating      | EF delta | Interval berekening
------------|----------|---------------------
Opnieuw     | -0.20    | 1 dag (reset)
Moeilijk    | -0.15    | vorig interval × 1.2
Goed        | +0.10    | vorig interval × EF
Makkelijk   | +0.15    | vorig interval × EF × 1.3
Max interval: 180 dagen
```

