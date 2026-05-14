# Vocale – Openstaande taken

## Legenda
- [ ] Te doen
- [x] Afgerond

---

## 1. Inline bewerking van woorden en vertalingen tijdens sessie

Tijdens een studie-sessie moet de gebruiker een woord of vertaling subtiel kunnen aanpassen zonder de sessie te onderbreken.

- [x] Klein bewerkingsicoontje (potlood) tonen naast het woord in de vraagkaart (naast de mute-knop in de header)
- [x] Klikken opent een compacte overlay-editor voor het woord én de vertaling
- [x] Opslaan werkt direct via Supabase; de kaart herlaadt met de gecorrigeerde waarde
- [x] Beschikbaar in alle kaarttypes via de Study-header (één plek, alle modi)

---

## 2. Willekeurige betekenis tonen bij woorden met meerdere betekenissen

Als een woord meerdere betekenissen heeft, mag er telkens maar één worden getoond.

- [x] Bij het laden van een kaart: willekeurig één betekenis selecteren uit de lijst (per cardId + mode)
- [x] Dezelfde selectie doorgeven aan de mc-antwoordopties (consistent juiste keuze)
- [x] Toegepast op MC (IntroCard) en productie NL→IT (ProductionCard nl_it)
- [ ] Gedrag verifiëren voor FlashcardCard en ListeningCard indien relevant

---

## 3. Totale beheersing op dashboard loopt niet op

Oorzaak: `getMasteryScore` las SM-2 legacy-velden (`repetitions`, `interval`) die nooit worden
bijgewerkt door FSRS-sessies.

- [x] Oorzaak opgespoord (SM-2/FSRS-disconnect)
- [x] Dashboard gebruikt nu `getFsrsMasteryScore` op basis van FSRS-stabiliteit
- [x] Word.status wordt na elke review gesynchroniseerd vanuit FSRS (via `persistReview` in Study)

---

## 4. Stats-pagina – blokje 'Prestatie' klopt niet

Zelfde oorzaak als #3: word.status nooit bijgewerkt door FSRS.

- [x] Status-counts (stabiel / herhaling / lerend / nieuw) worden nu live afgeleid van FSRS-states
- [x] Nauwkeurigheidsscore werkt onafhankelijk via sessiedata (was al correct)

---

## 5. Stats-pagina – blokje 'Activiteit' toont niets voor 7 en 30 dagen

Code is correct; sessieopslag en date-mapping kloppen. Vermoedelijke oorzaak: nog geen voltooide sessies in de database,
of `words_studied = 0` in opgeslagen sessies. Te monitoren na gebruik met de gecorrigeerde word-sync.

- [ ] Na een sessie verifiëren dat de balken zichtbaar zijn in de 7- en 30-dagenweergave
- [ ] Indien nog steeds leeg: `study_sessions`-tabel controleren op `words_studied`-waarden

---

## 6. Stats-pagina – 'Lastigste woorden' updaten niet

Zelfde oorzaak als #3/#4.

- [x] Hardste woorden gebaseerd op `getFsrsMasteryScore` + `consecutiveErrors` (nu gesynchroniseerd)

---

## 7. Stats-pagina – link 'Bekijk alle' geeft 404

Route was `/wordbank`; de correcte route is `/toevoegen`.

- [x] Link "Bekijk alle →" gecorrigeerd naar `/toevoegen`
- [x] Klikbare rijen in de 'Lastigste woorden'-lijst ook gecorrigeerd
