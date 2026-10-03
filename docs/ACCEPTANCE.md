# Odbiór SwapCircle

Zespół: **DEFOZO SOFTWARE HOUSE**. Jedyny członek: **Michał Kiełtyka**.

Ten dokument rozróżnia interaktywną symulację, rzeczywiste wykonanie programu i potwierdzenie publikacji. Docelowy zakres techniczny pochodzi z `official-2026-10-03/PLAN.md`; historyczny `PLAN.md` z katalogu głównego nie wyznacza zakresu. Najnowsze jawne zlecenie w `USER_REQUEST_PITCH_AUDIO_2026-10-03.md` nakazuje oprzeć pokaz na Demo i nie czekać na SOL ani wdrożenie Devnet. Jest podstawą bieżącego wydania materiałów, ale nie zamienia symulacji w dowód transakcji publicznej sieci.

## Bieżące wydanie Demo

[Wydanie `demo-pitch-2026-10-03`](https://github.com/Defozo/swapcircle-hackyeah2026/releases/tag/demo-pitch-2026-10-03) zostało opublikowane z targetem `d23ed4d`. Nowe materiały zastępują archiwalny pitch localnet w bieżącym pokazie. Publikacja zasobów wydania, wdrożenie Pages i zapis formularza HackTribe są osobnymi czynnościami.

| Obszar | Zapisany dowód | Stan |
| --- | --- | --- |
| Interaktywne Demo | `docs/evidence/demo-verification.json` | Oferty i dopasowanie 2/3/4 osób, niezależne wpłaty, rozliczenie przy ostatniej wpłacie, termin i osobne zwroty. Transfery i zegar są symulowane. Sprawdzono 32 kolejności wpłat, PL/EN, reset i odtworzenie stanu |
| Bieżące CI | `docs/evidence/pitch-ci.json` | [Run 37155888267](https://github.com/Defozo/swapcircle-hackyeah2026/actions/runs/37155888267) dla dokładnego commita `d894c1e9a7115bd45649d759cd80db44a8f8c723`: 75 Vitest, 10 testów Node, 16 SBF, 21 Playwright przeszło; 7 Playwright jawnie pominiętych. TypeScript, Vite i build SBF przeszły |
| Trzy uwagi pozostałe po wcześniejszym audycie UX | `docs/evidence/demo-verification.json`, `docs/evidence/pitch-ci.json` | Naprawione i sprawdzone w nowym zleceniu: widoczność fokusu przy zawijaniu dialogu, semantyka aktywnej nawigacji oraz objaśnienia adresu cyklu i konta tokenowego w PL/EN. Nie dopisujemy trzeciej rundy do zamkniętego audytu |
| Cross-review autora prezentacji | `docs/evidence/demo-cross-review.json` | Świeże konteksty 1440×900 i 390×844; sukces, brakująca wpłata, termin, osobne zwroty, reload, reset, język i podstawowa klawiatura sprawdzone. Błąd trwałości wyboru języka naprawiony i ponownie sprawdzony. Pozostaje drobna uwaga dotycząca czytelności etykiet grafu na mobile, z kompletną czytelną tabelą pod grafem; brak blokady przebiegu |
| Prezentacja i notatki | `submission/pitch/SwapCircle.pdf`, `submission/pitch/SwapCircle.pptx`, `submission/pitch/speaker-notes.txt`, `docs/evidence/pitch-deck.json` | 9 slajdów po polsku, edytowalne elementy PPTX i notatki do wszystkich 9 slajdów. Obejrzano każdą stronę eksportu PDF i render PowerPoint; zweryfikowano linki |
| Film, lektor i muzyka | `submission/pitch/SwapCircle-demo.mp4`, `submission/pitch/audio-verification.json`, `docs/evidence/pitch-release-review.json` | 108 s, polski lektor i cichy podkład, widoczne oznaczenie Demo. Pełne dekodowanie, ogląd wybranych klatek i percepcyjny przegląd całego rzeczywistego MP4 przez niezależne wywołanie modelu audiowizualnego. Brak potwierdzonych usterek; to nie deklaracja odsłuchu przez człowieka |
| Materiały wydania i pakiet | `submission/links.json`, `docs/evidence/pitch-package.json`, `docs/evidence/public-pitch-assets.json` | Pięć plików pobranych anonimowo z publicznych adresów; SHA-256 identyczne z lokalnymi oryginałami i digestami wydania. CRC obu pobranych ZIP poprawne |
| Publiczny frontend Demo i odtwarzacz | `docs/evidence/public-pitch-demo.json`, `docs/evidence/pitch-publication.json`, [Pages run 37156634563](https://github.com/Defozo/swapcircle-hackyeah2026/actions/runs/37156634563) | Wdrożony `d23ed4d`, zgodny z przetestowanym kodem WWW `d894c1e`. 30 kontroli przeszło w świeżej sesji bez logowania i portfela: rozliczenie, zwroty, reload i język na desktopie PL oraz mobile EN. Publiczny film odtworzony, 108 s / Full HD, 26 polskich napisów załadowanych; brak błędów strony |
| Zapis istniejącego projektu HackTribe | `HACKTRIBE_UPDATE_RESULT.json` | Zapisano 4.10.2026 o 00:01 Europe/Warsaw. Ponowny odczyt potwierdził wszystkie pola, `New Idea`, zachowane `visible=false` i identyczny PDF. Osiem publicznych linków sprawdzono po zapisie. Osobnej finalizacji nie wykonano |

Limity źródłowe: PDF do 10 slajdów, film do 3 minut, materiały PL albo EN. Bieżące 9 slajdów i 108 s mieszczą się w tych limitach. [Status formalny](../submission/formal-status.md) zapisuje aktualny termin finalnego zgłoszenia: **4 października 2026, 11:00 Europe/Warsaw**.

## Zachowane dowody techniczne i archiwalne materiały

Poniższe wyniki dotyczą wskazanych wcześniejszych wykonań i artefaktów. Nie przedstawiamy ich jako nowych transakcji wykonanych w interaktywnym Demo.

| Obszar | Zapisany dowód | Stan |
| --- | --- | --- |
| Program Anchor i rzeczywisty SBF | `programs/swapcircle`, `tests/program`, `docs/evidence/ci-final.json` | Zbudowany; 16 testów SBF przeszło, w tym 32 kolejności wpłat, 576 losowych operacji i pomiary brakujących ATA oraz refundu |
| Kwoty, hash i IDL, konta, transport SDK, pokwitowania CLI i bramki wydania | `tests/sdk`, `docs/evidence/ci-final.json` | 45 testów przeszło |
| Podpisy, wycofania i dokładny graf | `tests/matching` | 21 testów przeszło, w tym niezależne porównanie losowych grafów |
| Lokalizacja, pochodzenie źródeł wydania i trwałość dziennika transakcji | `tests/frontend`, `tests/release-provenance.test.mjs`, `tests/transaction-journal.test.mjs` | 5 testów lokalizacji i 10 testów Node przeszło; łącznie 81 testów jednostkowych |
| Wspólna tablica ofert | `tests/matching/live-result.json` | 13 rzeczywistych sprawdzeń działającego Convex przeszło |
| Pełne cykle 2, 3, 4 i fallback refund na RPC | `docs/evidence/localnet-flows.json` | Zapisany artefakt przeszedł odbiór; 29 transakcji odczytanych jako finalized podczas wykonania, dokładne salda potwierdzone |
| CLI w osobnym procesie z publicznego pakietu | `docs/evidence/localnet-independent-cli.json` | Finalized; nowy bezpieczny rachunek otrzymał 10 tokenów, bez klucza właściciela i bez manifestu/WWW/Convex |
| UI i rzeczywiste transakcje w przeglądarce | `apps/web/e2e`, `docs/evidence/ui-chain-success.json`, `docs/evidence/ui-chain-refund.json` | 6 testów UI w CI oraz osobno 3/3 finansowe E2E na rzeczywistym localnet: publikacja i wycofanie, rozliczenie trzech portfeli, odmowa podpisu, utracona odpowiedź RPC, blokada ponowienia po zmianie PL→EN, odtworzenie po reload i zwrot do nowego konta opłacony przez pomocnika |
| Zerwany WSS i deadline podczas podpisu | `docs/evidence/ui-websocket-polling.json`, `docs/evidence/ui-deadline-signature.json` | Dwie dodatkowe próby PASS: polling HTTP odczytał rzeczywistą wpłatę i rozliczenie po zamknięciu subskrypcji; podpis oddany po deadline wywołał `DeadlinePassed`, bez wpłaty lub automatycznego ponowienia, a pomocnik następnie zwrócił wcześniejszy depozyt. Graf po zamknięciu dialogu poprawiony i sprawdzony |
| Czytelność zapisanych błędów i stabilność grafu | `docs/evidence/ui-error-localization.json`, `docs/evidence/ui-graph-lifecycle.json` | Krótkie komunikaty PL/EN po reload, bez modyfikacji sygnatur lub statusów i bez wysyłania transakcji; lokalny przegląd UX rozszerzył kontrolę grafu do 17 próbek obejmujących modale, refresh, język, cykle 2→3→4→2 i zmianę szerokości |
| Lokalny przegląd UX po wcześniejszym wydaniu | `docs/UX-AUDIT-2026-10-03.md`, `docs/evidence/ux-independent-3.json` | Dwie rundy poprawek, testy przeglądarkowe 10/10 i 8/8; końcowy niezależny audyt zakończony wynikiem częściowym i trzema otwartymi uwagami. Ten historyczny wynik zachowano; późniejsze naprawy w nowym zleceniu opisano powyżej |
| Wcześniejszy publiczny frontend i repozytorium | `docs/evidence/public-web.json`, `docs/evidence/public-build.json` | HTTPS i publiczny kod były dostępne; świeża sesja bez logowania sprawdziła PL/EN, nawigację, mobile i Convex. Wszystkie 14 plików zgodne bajtowo z artefaktem CI `0c21b55`. Ten dowód nie potwierdza publikacji nowego Demo |
| Program Devnet i rzeczywiste portfele | `deployments/devnet.json` | Ostatni zapisany stan: program niewdrożony, płatnik bez testowych SOL. Brak nowego dowodu Devnet. Zgodnie z aktualnym zleceniem nie blokuje to przygotowania Demo, materiałów ani zapisu HackTribe |
| Osobny finalny program bez upgrade authority | `target/releases/`, `scripts/release.mjs`, `docs/evidence/prepared-release.json` | Osobny artefakt przygotowany; zgodność sześciu plików źródłowych z commitem `1fc13d8` sprawdzona. Niewdrożony, authority nieodebrane |
| Archiwalny PDF i film localnet | `submission/SwapCircle.pdf`, `submission/demo-localnet.mp4`, `docs/evidence/video-independent-qc.json` | Zachowane 10 stron PDF i film 114,7 s z rzeczywistymi transakcjami localnet. Pełne dekodowanie i niezależny przegląd wybranych kadrów, bez deklaracji pełnego oglądu ruchu. Archiwum nie jest bieżącym pitchem |
| Dane zespołu | `TEAM.json` | Potwierdzone przez użytkownika |

## Ograniczenia odbioru

Historyczny [raport audytu UX](UX-AUDIT-2026-10-03.md) zachowuje wynik i ograniczenia odczytowej sesji bez portfela po dwóch rundach poprawek. Trzy pozostałe wtedy uwagi naprawiono w późniejszym, odrębnie zleconym zakresie Demo. Bieżący cross-review wykonano przez autora prezentacji znającego projekt, na wybranych ścieżkach. Nie jest audytem bez wcześniejszej historii, pełnym WCAG ani badaniem z użytkownikami. Żaden z tych przeglądów sam w sobie nie potwierdza publicznego wdrożenia.

Historyczny [CI dla `0c21b55`](https://github.com/Defozo/swapcircle-hackyeah2026/actions/runs/37135672257) zakończył się powodzeniem: build programu i WWW, typecheck, 71 testów Vitest, 10 testów Node, 16 testów SBF oraz 6 testów UI. Pięć scenariuszy wymagających kluczy i lokalnego validatora było w tym CI jawnie pomijanych; ich osobne wykonania zakończyły się 3/3 podstawowe E2E oraz 2/2 próby odporności. Pierwsze trzy i utrata WSS były sprawdzane przed ostatnią poprawką grafu, deadline ze zwrotem także po niej. Ówczesna zmiana komunikatów została sprawdzona bez transakcji i bez zmiany zapisanej historii. Kod finansowy i program nie zmieniały się pomiędzy tymi próbami. Raporty nie utożsamiają środowisk ani dat poszczególnych wykonań. Bieżący CI jest zapisany osobno w `pitch-ci.json`; jego siedem pominięć nie jest zaliczanych do wykonanych testów.

Testowe podpisy z oddzielnych kluczy dowodzą wykonania programu na lokalnej sieci. Nie zastępują ręcznego odbioru rozszerzeń Phantom i Solflare na publicznym Devnet. Te próby, wdrożenie programu i odczyt braku upgrade authority pozostają niepotwierdzone względem docelowej definicji ukończenia z planu. Aktualne zlecenie świadomie prowadzi pokaz przez oznaczone Demo, bez oczekiwania na te czynności i bez przedstawiania symulacji jako transakcji Devnet.

Kwoty dX/dY/dZ/dSIX są demonstracyjne. Nie przeprowadzono wywiadów ani prób z niezależnymi użytkownikami, więc popyt oraz zrozumienie warunków pozostają do zweryfikowania. Wdrożenie Convex potwierdza działanie tablicy ofert, nie bezpieczeństwo lub stan środków.

Próba niezależnego CLI używała `localhost` zamiast `127.0.0.1` dla tego samego lokalnego validatora. Dowodzi działania bez WWW, Convex i klucza właściciela, lecz nie dostępności drugiego dostawcy RPC. Odbiór devnet musi obejmować recovery przez osobny sprawdzony endpoint oraz odtworzenie pełnego przepływu przez osobę spoza zespołu. Kontakty z taką osobą nie były zlecane i nie zostały wykonane.

Lokalny validator uruchomiony z domyślną retencją usunął część starszej historii transakcji. Każda transakcja została sprawdzona przy `finalized` w czasie testu. Późniejszy odczyt potwierdził nadal istniejące konta cykli i dokładne bajty programu; raport jawnie zapisuje brakujące historyczne pokwitowania. Konfiguracja kolejnych uruchomień zwiększa retencję do 1 000 000 shreds. Nie oznacza to odzyskania już usuniętej historii. Bramka finalnego devnet nadal wymaga wszystkich aktualnie dostępnych pokwitowań finalized.
