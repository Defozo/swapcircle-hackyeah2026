# Odbiór SwapCircle

Zespół: **DEFOZO SOFTWARE HOUSE**. Jedyny członek: **Michał Kiełtyka**.

Ten dokument rozróżnia implementację, rzeczywiste wykonanie i nieukończone bramki. Wiążący zakres pochodzi z `official-2026-10-03/PLAN.md`; nie został zmniejszony. Historyczny `PLAN.md` z katalogu głównego nie wyznacza zakresu.

| Obszar | Zapisany dowód | Stan |
| --- | --- | --- |
| Program Anchor i rzeczywisty SBF | `programs/swapcircle`, `tests/program`, `docs/evidence/ci-final.json` | Zbudowany; 16 testów SBF przeszło, w tym 32 kolejności wpłat, 576 losowych operacji i pomiary brakujących ATA oraz refundu |
| Kwoty, hash i IDL, konta, transport SDK, pokwitowania CLI i bramki wydania | `tests/sdk`, `docs/evidence/ci-final.json` | 45 testów przeszło |
| Podpisy, wycofania i dokładny graf | `tests/matching` | 21 testów przeszło, w tym niezależne porównanie losowych grafów |
| Lokalizacja, pochodzenie źródeł wydania i trwałość dziennika transakcji | `tests/frontend`, `tests/release-provenance.test.mjs`, `tests/transaction-journal.test.mjs` | 5 testów lokalizacji i 10 testów Node przeszło; łącznie 81 testów jednostkowych |
| Wspólna tablica ofert | `tests/matching/live-result.json` | 13 rzeczywistych sprawdzeń działającego Convex przeszło |
| Pełne cykle 2, 3, 4 i fallback refund na RPC | `docs/evidence/localnet-flows.json` | Aktualny artefakt przeszedł odbiór; 29 transakcji odczytanych jako finalized podczas wykonania, dokładne salda potwierdzone |
| CLI w osobnym procesie z publicznego pakietu | `docs/evidence/localnet-independent-cli.json` | Finalized; nowy bezpieczny rachunek otrzymał 10 tokenów, bez klucza właściciela i bez manifestu/WWW/Convex |
| UI i rzeczywiste transakcje w przeglądarce | `apps/web/e2e`, `docs/evidence/ui-chain-success.json`, `docs/evidence/ui-chain-refund.json` | 6 testów UI w CI oraz osobno 3/3 finansowe E2E na rzeczywistym localnet: publikacja i wycofanie, rozliczenie trzech portfeli, odmowa podpisu, utracona odpowiedź RPC, blokada ponowienia po zmianie PL→EN, odtworzenie po reload i zwrot do nowego konta opłacony przez pomocnika |
| Zerwany WSS i deadline podczas podpisu | `docs/evidence/ui-websocket-polling.json`, `docs/evidence/ui-deadline-signature.json` | Dwie dodatkowe próby PASS: polling HTTP odczytał rzeczywistą wpłatę i rozliczenie po zamknięciu subskrypcji; podpis oddany po deadline wywołał `DeadlinePassed`, bez wpłaty lub automatycznego ponowienia, a pomocnik następnie zwrócił wcześniejszy depozyt. Graf po zamknięciu dialogu poprawiony i sprawdzony |
| Czytelność zapisanych błędów i stabilność grafu | `docs/evidence/ui-error-localization.json`, `docs/evidence/ui-graph-lifecycle.json` | Krótkie komunikaty PL/EN po reload, bez modyfikacji sygnatur lub statusów i bez wysyłania transakcji; 11 kontroli grafu obejmuje modale, refresh, język i cykle 2→3→4→2 |
| Publiczny frontend i repozytorium | `submission/links.json`, `docs/evidence/public-web.json`, `docs/evidence/public-build.json` | HTTPS i publiczny kod dostępne; świeża sesja bez logowania sprawdziła PL/EN, nawigację, mobile i połączenie z Convex. Wszystkie 14 plików publicznych zgodne bajtowo z artefaktem CI `0c21b55`. Program devnet nadal niewdrożony |
| Program devnet i rzeczywiste portfele | `deployments/devnet.json` | Niewdrożony; płatnik ma 0 testowych SOL |
| Osobny finalny program bez upgrade authority | `target/releases/`, `scripts/release.mjs`, `docs/evidence/prepared-release.json` | Osobny artefakt przygotowany; zgodność sześciu plików źródłowych z commitem `1fc13d8` sprawdzona. Niewdrożony, authority nieodebrane |
| Opis, PDF do 10 slajdów, film do 3 minut | `submission/`, `docs/evidence/video-independent-qc.json` | Opis i 10 stron PDF; film 114,7 s z rzeczywistymi transakcjami localnet. Pełne dekodowanie i niezależny przegląd wybranych kadrów, bez deklaracji pełnego oglądu ruchu |
| Dane zespołu | `TEAM.json` | Potwierdzone przez użytkownika |
| Wysłanie zgłoszenia HackTribe | Brak potwierdzenia wysłania | Nie wykonano; przygotowanie pakietu nie oznacza zgłoszenia |

## Ograniczenia odbioru

Końcowy [CI dla `0c21b55`](https://github.com/Defozo/swapcircle-hackyeah2026/actions/runs/37135672257) zakończył się powodzeniem: build programu i WWW, typecheck, 71 testów Vitest, 10 testów Node, 16 testów SBF oraz 6 testów UI. Pięć scenariuszy wymagających kluczy i lokalnego validatora jest w CI jawnie pomijanych; ich osobne wykonania zakończyły się 3/3 podstawowe E2E oraz 2/2 próby odporności. Pierwsze trzy i utrata WSS były sprawdzane przed ostatnią poprawką grafu, deadline ze zwrotem także po niej. Ostatnia zmiana komunikatów została sprawdzona bez transakcji i bez zmiany zapisanej historii. Kod finansowy i program nie zmieniały się pomiędzy tymi próbami. Raporty nie utożsamiają środowisk ani dat poszczególnych wykonań.

Testowe podpisy z oddzielnych kluczy dowodzą wykonania programu na lokalnej sieci. Nie zastępują ręcznego odbioru rozszerzeń Phantom i Solflare na publicznym devnet. Dopóki te próby, publiczne wdrożenie i odczyt braku upgrade authority nie zostaną wykonane, projekt nie spełnia całej definicji ukończenia z planu.

Kwoty dX/dY/dZ/dSIX są demonstracyjne. Nie przeprowadzono wywiadów ani prób z niezależnymi użytkownikami, więc popyt oraz zrozumienie warunków pozostają do zweryfikowania. Wdrożenie Convex potwierdza działanie tablicy ofert, nie bezpieczeństwo lub stan środków.

Próba niezależnego CLI używała `localhost` zamiast `127.0.0.1` dla tego samego lokalnego validatora. Dowodzi działania bez WWW, Convex i klucza właściciela, lecz nie dostępności drugiego dostawcy RPC. Odbiór devnet musi obejmować recovery przez osobny sprawdzony endpoint oraz odtworzenie pełnego przepływu przez osobę spoza zespołu. Kontakty z taką osobą nie były zlecane i nie zostały wykonane.

Lokalny validator uruchomiony z domyślną retencją usunął część starszej historii transakcji. Każda transakcja została sprawdzona przy `finalized` w czasie testu. Późniejszy odczyt potwierdził nadal istniejące konta cykli i dokładne bajty programu; raport jawnie zapisuje brakujące historyczne pokwitowania. Konfiguracja kolejnych uruchomień zwiększa retencję do 1 000 000 shreds. Nie oznacza to odzyskania już usuniętej historii. Bramka finalnego devnet nadal wymaga wszystkich aktualnie dostępnych pokwitowań finalized.
