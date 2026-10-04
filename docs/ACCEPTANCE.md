# Testy SwapCircle

## Środowiska

Publiczne Demo używa algorytmu wyszukiwania produktu, lecz symuluje czas i transfery tokenów. Rzeczywisty program Solana jest testowany na lokalnym validatorze i w LiteSVM. Zapisane wyniki localnet nie potwierdzają wdrożenia Devnet. Manifest `deployments/devnet.json` ma `deployed: false`; klient z portfelem dodatkowo odczytuje stan programu z sieci.

## Odtworzenie testów

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:program
pnpm exec playwright install chromium
pnpm test:e2e
```

Testy programu wymagają środowiska Rust/Anchor/Solana opisanego w [README](../README.md). Finansowe testy przeglądarkowe wymagają lokalnego validatora i jawnie podanych kluczy testowych. Bez nich te scenariusze są pomijane, a nie zaliczane jako wykonane.

## Zakres i wyniki

Weryfikacja z 4 października 2026 dla kodu w commicie `f6e97da` potwierdziła 75 testów Vitest, 10 testów Node, sprawdzanie typów i build Vite. Dotyczyła tego samego kodu produktu co poniższe CI.

[CI dla commita `48c7494`](https://github.com/Defozo/swapcircle-hackyeah2026/actions/runs/37159406838) zakończyło się powodzeniem: 75 Vitest, 10 Node, 16 testów SBF i 25 Playwright. Siedem scenariuszy Playwright wymagających localnetu, kluczy lub istniejących kont było pominiętych. Kompilacja programu i aplikacji przeszła.

- Dopasowanie: podpisy ofert, wycofania, dokładne ilości i cykle 2-4 stron, w tym porównanie z enumeracją małych grafów.
- Program: wszystkie 32 kolejności wpłat dla 2-4 osób, granica deadline, nieprawidłowe konta, wycofanie ostatniej transakcji przy błędzie transferu, niezależne zwroty, replay, darowizny i zachowanie ilości.
- SDK i CLI: kodowanie kwot, hashe, konta, stan transakcji po utracie odpowiedzi i warunki wydania.
- Interfejs: Demo, walidacja adresów i kwot, polski i angielski oraz odtworzenie dziennika po odświeżeniu.

[Dane localnet](evidence/localnet-flows.json) zawierają 29 transakcji odczytanych jako finalized w czasie wykonania i sprawdzenie dokładnych sald. [Próba niezależnego CLI](evidence/localnet-independent-cli.json) potwierdza zwrot do konta właściciela z publicznego pakietu, bez klucza właściciela i bez tablicy ofert. Starszy validator usunął część historii transakcji; raport rozróżnia pierwotne potwierdzenia i dostępność pokwitowań w późniejszym odczycie. [Pomiary](measurements.md) wyjaśniają koszty, rent i środowiska wykonania.

## Korzystanie z wersji demonstracyjnej

Używaj wyłącznie aktywów testowych. Wcześniejsze wpłaty pozostają zablokowane do rozliczenia lub deadline, a zwrot po terminie wymaga transakcji i opłaty. Program nie gwarantuje ceny ani płynności. Klient pokazuje upgrade authority; dopóki istnieje, kod programu może się zmienić. Pełne warunki opisuje [protokół](protocol.md).

Automatyczne testy nie zastępują niezależnego audytu bezpieczeństwa ani odbioru rzeczywistych rozszerzeń portfeli w docelowej sieci. Procedura [wydania](release.md) wymaga odrębnych dowodów przed odebraniem upgrade authority. Raport testów nie stanowi deklaracji pełnej zgodności dostępności interfejsu.
