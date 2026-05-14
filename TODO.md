# Vocale – Openstaande taken

## Legenda
- [ ] Te doen
- [x] Afgerond

---

## 1. Inline bewerking van woorden en vertalingen tijdens sessie

Tijdens een studie-sessie moet de gebruiker een woord of vertaling subtiel kunnen aanpassen zonder de sessie te onderbreken.

- [ ] Klein bewerkingsicoontje (potlood) tonen naast het woord in de vraagkaart
- [ ] Klikken opent een compacte inline editor (niet een volledige modal) voor het woord én de vertaling
- [ ] Opslaan werkt direct via Supabase; de kaart herlaadt met de gecorrigeerde waarde
- [ ] Bewerking is beschikbaar in alle kaarttypes (FlashcardCard, FillBlankCard, ProductionCard, ListeningCard)

---

## 2. Willekeurige betekenis tonen bij woorden met meerdere betekenissen

Als een woord meerdere betekenissen heeft, mag er telkens maar één worden getoond.

- [ ] Bij het laden van een kaart: willekeurig één betekenis selecteren uit de lijst
- [ ] Dezelfde willekeurige selectie toepassen op de mc-antwoordopties (zodat de getoonde betekenis consistent is met de juiste keuze)
- [ ] Gedrag verifiëren voor FlashcardCard, FillBlankCard en mc-varianten

---

## 3. Totale beheersing op dashboard loopt niet op

- [ ] Oorzaak opsporen: berekening of query die de beheersingscore voorziet op het dashboard
- [ ] Logica corrigeren zodat de score oploopt naarmate woorden worden geoefend
- [ ] Testen met bekende woordenset om te verifiëren dat de waarde correct stijgt

---

## 4. Stats-pagina – blokje 'Prestatie' klopt niet

- [ ] Oorzaak opsporen waarom de prestatiescore niet wordt bijgewerkt
- [ ] Fix doorvoeren en gedrag verifiëren

---

## 5. Stats-pagina – blokje 'Activiteit' toont niets voor 7 en 30 dagen

- [ ] Controleren welke query/aggregatie wordt gebruikt voor de activiteitsgrafiek
- [ ] 7-dagenweergave repareren
- [ ] 30-dagenweergave repareren
- [ ] Testen dat activiteit correct verschijnt na het voltooien van een sessie

---

## 6. Stats-pagina – 'Lastigste woorden' updaten niet

- [ ] Opsporen waarom de lijst niet ververst na sessies
- [ ] Fix doorvoeren

---

## 7. Stats-pagina – link 'Bekijk alle' geeft 404

- [ ] Routedefinitie of href opsporen die de 404 veroorzaakt
- [ ] Juiste route instellen of aanmaken
- [ ] Verifiëren dat de pagina correct laadt
