# SwapCircle: pakiet demonstracyjny LOCALNET

Zespół: **DEFOZO SOFTWARE HOUSE**. Jedyny członek: **Michał Kiełtyka**.

To przygotowane materiały do zgłoszenia, z rzeczywistym wykonaniem na lokalnym validatorze Solany. Pakiet nie oznacza wysłania zgłoszenia ani zakończonego odbioru na devnet. Film używa jawnie opisanych automatycznych podpisów testowych. Kwoty i tokeny demonstracyjne nie mają deklarowanej wartości pieniężnej.

Kod, instrukcja uruchomienia i pełny raport odbioru są dostępne w [publicznym repozytorium](https://github.com/Defozo/swapcircle-hackyeah2026), w szczególności w [docs/ACCEPTANCE.md](https://github.com/Defozo/swapcircle-hackyeah2026/blob/main/docs/ACCEPTANCE.md). Adresy aplikacji, filmu i PDF znajdują się w `links.json`. Publiczny frontend nie dowodzi wdrożenia programu devnet.

W archiwum znajdują się: `TEAM.json`, `description.md`, `SwapCircle.pdf`, `demo-localnet.mp4`, `demo-localnet.evidence.json`, `links.json`, `formal-status.md`, `speaker-notes.txt` i ten README. PDF ma 10 stron. Film trwa 114,7 s i pokazuje podpisane oferty, rozliczenie cyklu oraz niezależne zwroty. Dowody obejmują lokalne transakcje, odczyty stanu i sald; nie są dowodem popytu. Odwołania w zachowanych materiałach do katalogów `submission/` i `docs/` dotyczą struktury repozytorium.

Pozostałe bramki z planu:

- **Devnet:** brak testowych SOL dla płatnika wdrożenia; program devnet jest niewdrożony. Potrzebne są wdrożenie oraz odczyt rzeczywistych transakcji i sald na tej sieci.
- **Portfele:** integracja Phantom i Solflare jest zaimplementowana, ale ręczny odbiór ich rzeczywistych rozszerzeń na devnet pozostaje do wykonania. Automatyczny portfel testowy go nie zastępuje.
- **Wydanie niezmienne:** osobny finalny artefakt jest przygotowany. Nie został wdrożony, a odebranie upgrade authority i odczyt jego braku nie zostały wykonane. Nie deklarujemy finalnego programu jako immutable.
- **Niezależność odbioru:** pełny przepływ przez osobę spoza zespołu i recovery przez drugiego dostawcę RPC pozostają do sprawdzenia. Wykonany osobny CLI używał tego samego lokalnego validatora pod inną nazwą hosta. Walidacja rzeczywistych potrzeb użytkowników także pozostaje otwarta.
- **Formalności:** zgłoszenia do HackTribe nie wysłano. Trzeba potwierdzić aktualne pola formularza, termin wobec rozbieżnych zapisów regulaminów, uprawnienie do udziału oraz utrwalić końcową wersję przed właściwym terminem. Szczegóły są w `formal-status.md`; nie złożono oświadczeń w imieniu uczestnika.

Przygotowanie i sprawdzenie tego archiwum nie zmienia statusu żadnej z powyższych bramek. Materiały PDF i wideo zostały zapakowane bez zmian.
