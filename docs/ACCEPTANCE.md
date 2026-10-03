# Odbiór SwapCircle

Zespół: **DEFOZO SOFTWARE HOUSE**. Jedyny członek: **Michał Kiełtyka**.

Ten dokument rozróżnia implementację, rzeczywiste wykonanie i nieukończone bramki. Docelowy zakres pochodzi z `official-2026-10-03/PLAN.md`; nie został zmniejszony. Oryginalny plan pozostaje dokumentem historycznym wymagań.

| Obszar | Zapisany dowód | Stan |
| --- | --- | --- |
| Program Anchor i rzeczywisty SBF | `programs/swapcircle`, `tests/program`, przypięty obraz | Zbudowany; 15 testów SBF przeszło, w tym 32 kolejności wpłat i 576 losowych operacji |
| Kwoty, hash i IDL, konta, transport SDK i pokwitowania CLI | `tests/sdk` | 35 testów przeszło |
| Podpisy, wycofania i dokładny graf | `tests/matching` | 21 testów przeszło, w tym niezależne porównanie losowych grafów |
| Wspólna tablica ofert | `tests/matching/live-result.json` | 13 rzeczywistych sprawdzeń działającego Convex przeszło |
| Pełne cykle 2, 3, 4 i fallback refund na RPC | `docs/evidence/localnet-flows.json` | Aktualny artefakt przeszedł odbiór; 29 transakcji odczytanych jako finalized podczas wykonania, dokładne salda potwierdzone |
| CLI w osobnym procesie z publicznego pakietu | `docs/evidence/localnet-independent-cli.json` | Finalized; nowy bezpieczny rachunek otrzymał 10 tokenów, bez klucza właściciela i bez manifestu/WWW/Convex |
| UI i rzeczywiste transakcje w przeglądarce | `apps/web/e2e` | Próby i poprawki w toku |
| Publiczny frontend i repozytorium | `submission/links.json` po weryfikacji | Publikacja w przygotowaniu |
| Program devnet i rzeczywiste portfele | `deployments/devnet.json` | Niewdrożony; płatnik ma 0 testowych SOL |
| Osobny finalny program bez upgrade authority | `target/releases/`, `scripts/release.mjs` | Osobny artefakt przygotowany; niewdrożony, authority nieodebrane |
| Opis, PDF do 10 slajdów, film do 3 minut | `submission/` | Opis i PDF gotowe do aktualizacji wyników; nagranie w przygotowaniu |
| Dane zespołu | `TEAM.json` | Potwierdzone przez użytkownika |
| Wysłanie zgłoszenia HackTribe | Brak potwierdzenia wysłania | Nie wykonano; przygotowanie pakietu nie oznacza zgłoszenia |

## Ograniczenia odbioru

Testowe podpisy z oddzielnych kluczy dowodzą wykonania programu na lokalnej sieci. Nie zastępują ręcznego odbioru rozszerzeń Phantom i Solflare na publicznym devnet. Dopóki te próby, publiczne wdrożenie i odczyt braku upgrade authority nie zostaną wykonane, projekt nie spełnia całej definicji ukończenia z planu.

Kwoty dX/dY/dZ/dSIX są demonstracyjne. Nie przeprowadzono wywiadów ani prób z niezależnymi użytkownikami, więc popyt oraz zrozumienie warunków pozostają do zweryfikowania. Wdrożenie Convex potwierdza działanie tablicy ofert, nie bezpieczeństwo lub stan środków.

Lokalny validator uruchomiony z domyślną retencją usunął część starszej historii transakcji. Każda transakcja została sprawdzona przy `finalized` w czasie testu. Późniejszy odczyt potwierdził nadal istniejące konta cykli i dokładne bajty programu; raport jawnie zapisuje brakujące historyczne pokwitowania. Konfiguracja kolejnych uruchomień zwiększa retencję do 1 000 000 shreds. Nie oznacza to odzyskania już usuniętej historii. Bramka finalnego devnet nadal wymaga wszystkich aktualnie dostępnych pokwitowań finalized.
