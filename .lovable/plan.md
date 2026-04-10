## Plan: Slimmere Leerfasen & Meer Diversiteit

### Probleem

1. Bij herhaaldelijk fout typen blijf je vastzitten in de moeilijkste vorm (productie). Dat is frustrerend en ineffectief.
2. Er is weinig variatie — het is steeds "typ het woord". Dat leidt tot mechanisch typen zonder diep leren.

### Oplossing

#### A. Fallback bij herhaalde fouten

Als een woord in de **productie-fase** 2× achter elkaar fout wordt beantwoord (bij te tracken via een nieuw veld `consecutiveErrors` op Word), schakelt de app automatisch terug naar **multiple choice** voor dat woord. Na een correcte MC gaat het woord weer terug naar productie in de volgende sessie.

#### B. Nieuwe leervormen (4 modi in totaal)


| Modus                          | Wat doet de gebruiker?                            | Wanneer?                                            |
| ------------------------------ | ------------------------------------------------- | --------------------------------------------------- |
| **Multiple Choice** (bestaand) | Kies de juiste vertaling                          | Introductie + fallback bij fouten                   |
| **Productie/Typen** (bestaand) | Typ het Italiaanse woord                          | Learning-fase                                       |
| **Luisteroefening** *(nieuw)*  | Hoor het woord (TTS), typ wat je hoort            | Introductie & fallback                              |
| **Zinnen aanvullen** *(nieuw)* | Vul het ontbrekende woord in een voorbeeldzin aan | Review/stable, als `exampleSentence` beschikbaar is |


De luisteroefening gebruikt de **Web Speech API** (gratis, ingebouwd in browsers) met Italiaanse spraak. Zinnen aanvullen toont de voorbeeldzin met een blanco waar het doelwoord hoort.

De fase-toewijzing wordt dynamisch: in plaats van altijd dezelfde modus per status, kiest het systeem willekeurig uit de beschikbare modi voor die status, wat zorgt voor afwisseling.

### Technische wijzigingen

1. `**src/types/word.ts**` — Veld `consecutiveErrors: number` toevoegen (default 0)
2. `**src/lib/srs.ts**` —
  - `calculateNextReview`: reset `consecutiveErrors` bij goed, verhoog bij fout
  - Nieuwe functie `pickExerciseType(word)` die op basis van status + consecutiveErrors + beschikbare data de modus kiest
3. `**src/pages/Study.tsx**` — Phase-logica vervangen door `pickExerciseType()`, nieuwe componenten renderen
4. `**src/components/study/ListeningCard.tsx**` *(nieuw)* — TTS-component: speelt woord af, gebruiker typt wat ze hoort
5. `**src/components/study/FillBlankCard.tsx**` *(nieuw)* — Toont voorbeeldzin met blanco, gebruiker vult het doelwoord in
6. **Database-migratie** — Kolom `consecutive_errors` toevoegen aan words-tabel (default 0)

### Fase-toewijzing logica

```text
status = 'new'           → altijd MC (introductie)
status = 'learning':
  consecutiveErrors >= 2  → MC (fallback)
  anders                  → willekeurig: productie of luisteren
status = 'review'/'stable':
  exampleSentence exists  → willekeurig: flashcard, luisteren, of zin aanvullen
  anders                  → willekeurig: flashcard of luisteren
```