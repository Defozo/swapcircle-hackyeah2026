# SwapCircle

**DEFOZO SOFTWARE HOUSE · Michał Kiełtyka**

SwapCircle wyszukuje zgodne wymiany klasycznych tokenów SPL pomiędzy 2-4 osobami. Każda osoba podpisuje własną wpłatę do niezmiennego cyklu. Ostatnia wpłata przed terminem wykonuje wszystkie przekazania w jednej transakcji Solany. Jeśli zabraknie uczestnika, po terminie każdy depozyt można odzyskać niezależnie, także z CLI i bez serwera ofert.

Przykład: Alicja oddaje 100 dX za 40 dY, Bartek 40 dY za 250 dZ, Celina 250 dZ za 100 dX. Nie ma zgodnej pary. Cykl Alicja → Celina → Bartek → Alicja zaspokaja wszystkie potrzeby. Ilości są uzgodnione, bez oracle, kursu i zaokrąglania.

## Wypróbuj SwapCircle

[Otwórz interaktywne demo](https://defozo.github.io/swapcircle-hackyeah2026/) i przejdź przez wymianę bez instalacji i podłączania portfela. Zacznij od trzech ofert, znajdź cykl, sprawdź warunki i wykonaj kolejne wpłaty. Wypróbuj też brakującą wpłatę i zwrot po terminie. Dostępne są warianty dla 2, 3 i 4 osób. Tryb Demo symuluje operacje, wykorzystując wyszukiwarkę cykli produktu.

[Film z lektorem i prezentacja](https://defozo.github.io/swapcircle-hackyeah2026/watch.html) pokazują pełną drogę od ofert do rozliczenia.

Samo demo wymaga Node.js 24 i pnpm 10.33.0:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @swapcircle/web dev --port 5187
```

Otwórz `http://localhost:5187/`. Instrukcja poniżej uruchamia również program na lokalnym validatorze; klient z portfelem jest dostępny pod `http://localhost:5187/?mode=app`.

## Stan techniczny i dowody

Kod implementuje program, SDK, tablicę podpisanych ofert Convex, wyszukiwanie cykli, aplikację i niezależne odzyskiwanie. Aktualny stan odbioru opisuje [raport wykonania](docs/ACCEPTANCE.md). Wyniki lokalne nie oznaczają wykonania transakcji devnet. Manifest `deployments/devnet.json` jawnie wskazuje `deployed: false`, dopóki wdrożenie nie zostanie odczytane z sieci. Interfejs nie przedstawia tego programu jako działającego ani niezmiennego.

[Klient z portfelem](https://defozo.github.io/swapcircle-hackyeah2026/?mode=app) pokazuje aktualny status wdrożenia odczytany z sieci. Publiczne Demo i pomiary localnet są odrębnymi rodzajami dowodu.

- [Model protokołu i zaufania](docs/protocol.md)
- [Pomiary rzeczywistych transakcji localnet](docs/evidence/localnet-flows.json)
- [Pomiary programu SBF w LiteSVM](tests/program/measurements.json)
- [Weryfikacja działającej tablicy Convex](tests/matching/live-result.json)
- [Opis zgłoszenia](submission/description.md), [prezentacja PDF](submission/pitch/SwapCircle.pdf), [edytowalny PPTX](submission/pitch/SwapCircle.pptx), [scenariusz localnet](docs/demo.md)
- [Film: rzeczywisty localnet, 1:55](https://github.com/Defozo/swapcircle-hackyeah2026/releases/tag/demo-localnet-2026-10-03), [salda i sygnatury nagrania](submission/demo-localnet.evidence.json)
- [Aktualny pakiet materiałów ZIP](https://github.com/Defozo/swapcircle-hackyeah2026/releases/download/demo-pitch-2026-10-03/SwapCircle-package.zip): prezentacja, film, notatki i dane zespołu. [Archiwalny pakiet localnet](https://github.com/Defozo/swapcircle-hackyeah2026/releases/tag/demo-localnet-2026-10-03) zachowuje pierwotne nagranie rzeczywistych lokalnych transakcji.
- [Pełny zakres pomiarów kosztów i limitów](docs/measurements.md)
- [Hipoteza potrzeby i plan walidacji](docs/validation-research.md)

## Uruchomienie lokalne

Wymagane: Node.js 24, pnpm 10.33.0, Docker z kontenerami Linux oraz `psst` do wstrzykiwania sekretów. Windows: Docker Desktop z WSL2. Zestaw Rust/Anchor/Solana jest w przypiętym obrazie, nie wymaga instalowania tych CLI na hoście. Repozytorium zawiera także konfigurację VS Code Dev Containers.

```powershell
corepack enable
pnpm install --frozen-lockfile
node scripts/init-secrets.mjs
pnpm setup:localnet
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_BOB_KEY SWAPCIRCLE_DEVNET_CELINE_KEY SWAPCIRCLE_DEVNET_RECOVERY_KEY -- pnpm seed:localnet
pnpm run doctor --manifest deployments/localnet.json
```

Nazwy sekretów zawierają `DEVNET`, ale te same wydzielone testowe portfele mogą pracować na localnet. Skrypt tworzy klucze tylko przy braku wpisu w psst i nie wypisuje ich wartości. Nie używaj portfeli przechowujących rzeczywiste środki. Własna instalacja potrzebuje własnych testowych kluczy, nie klucza do lokalnie załadowanego programu.

`setup:localnet` buduje program i sprawdza bajty wykonującego się programu. Zwykłe uruchomienie zachowuje ledger. Zmiana programu wymagająca nowego ledgera jest jawna: `pnpm setup:localnet -- --reset`. Reset usuwa wyłącznie lokalny stan testowy i wymaga ponownego seedowania oraz wygenerowania ofert. Skrypt sprawdza mount kontenera przed jego zmianą. Porty RPC/WSS są udostępnione wyłącznie na loopback.

Uruchom frontend w drugim terminalu:

```powershell
$env:VITE_SOLANA_RPC_URL='http://127.0.0.1:8899'
$env:VITE_SOLANA_WS_URL='ws://127.0.0.1:8900'
$env:VITE_DEMO_MANIFEST_URL='/deployments/localnet.json'
$env:VITE_CONVEX_URL=''
pnpm --filter @swapcircle/web dev --port 5187
```

Adres Vite pojawi się w terminalu. Otwórz go z `?mode=app`, aby użyć klienta z portfelem. Aplikacja używa routingu hash, więc odświeżenie adresu cyklu działa także na statycznym hostingu. Manifest localnet jest zapisywany przez seed również do `apps/web/public/deployments/`. Przeglądarka weryfikuje genesis hash RPC. Portfel musi obsługiwać wybraną sieć. Phantom i Solflare są zintegrowane przez Wallet Adapter; testowy signer występuje wyłącznie w testach, nie w publicznym buildzie.

Do deterministycznego zestawu ofert bez zgodnych par:

```powershell
psst SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_BOB_KEY SWAPCIRCLE_DEVNET_CELINE_KEY -- pnpm exec tsx packages/matching/scripts/seed-offers.ts --cluster localnet
```

Zaimportuj w interfejsie `apps/web/public/fixtures/localnet-offers.json`. Oferty mają termin ważności, więc po jego upływie lub po resecie trzeba je wygenerować ponownie. Można też podłączyć własny portfel, opublikować podpisaną ofertę lub ręcznie utworzyć uzgodniony cykl. Klucze demonstracyjne nie są udostępniane przez aplikację.

## Testy i odtworzenie przepływów

```powershell
pnpm test
pnpm build
pnpm test:program
pnpm exec playwright install chromium
pnpm test:e2e
psst SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_BOB_KEY SWAPCIRCLE_DEVNET_CELINE_KEY SWAPCIRCLE_DEVNET_RECOVERY_KEY -- pnpm verify:localnet
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_RECOVERY_KEY -- pnpm verify:recovery --manifest deployments/localnet.json
```

Pełny odbiór RPC czeka na `finalized`, a nie tylko na wysłanie transakcji. Sprawdza cykle 2, 3, 4 stron, brak wypłat przed ostatnią wpłatą, dokładne salda, niezależne zwroty, zastępcze konto właściciela i zwrot rent vaultów. Scenariusz recovery celowo zmienia authority testowego ATA i przywraca je na końcu; nie uruchamiaj go równolegle z ręcznym pokazem na tych samych portfelach.

`verify:recovery` tworzy odrębny testowy depozyt i uruchamia CLI w nowym katalogu tymczasowym, z samym publicznym pakietem i kluczem obcego płatnika. Nie przekazuje klucza właściciela, manifestu, dostępu do Convex ani frontendu. Potwierdza właściciela nowego konta i saldo. Testy finansowe E2E wymagają lokalnego validatora i jawnego wstrzyknięcia testowych kluczy; szczegóły są w `apps/web/e2e/`.

Testy SBF obejmują m.in. wszystkie 32 kolejności wpłat dla 2-4 stron, wycofanie całej ostatniej transakcji przy błędzie transferu, `Clock == deadline`, niedozwolone konta i standardy tokenów, replay, darowizny, overflow, cleanup oraz losowe sekwencje sprawdzające zachowanie ilości.

## Odzyskiwanie bez aplikacji

Pobierz publiczny pakiet JSON z widoku cyklu i zachowaj kopię repozytorium. Pakiet zawiera sieć, genesis hash, program, cykl, nogę, właściciela, mint, dokładną ilość, deadline i wersję formatu. Nie zawiera kluczy.

```powershell
# Sam odczyt nie wymaga sekretu. Nie jest potrzebny plik manifestu.
pnpm recover -- --package recovery.json --rpc http://127.0.0.1:8899

# Po terminie pomocnik płaci opłatę. Właściciel tokenów nie musi podpisywać.
psst SWAPCIRCLE_DEVNET_RECOVERY_KEY -- pnpm recover -- --package recovery.json --rpc http://127.0.0.1:8899 --execute --fresh-account --out receipt.json

# Sprawdzenie wcześniej wysłanej transakcji, bez nowego podpisu.
pnpm recover -- --package recovery.json --rpc http://127.0.0.1:8899 --check-signature SIGNATURE
```

Dla devnet użyj RPC devnet. Inny RPC musi zwrócić genesis hash zgodny z pakietem. `--fresh-account` atomowo tworzy i inicjalizuje konto należące do uprawnionego właściciela oraz zwraca na nie tokeny. Pomocnik nie uzyskuje authority ani prawa do tokenów. Bez tej opcji SDK sprawdza bieżące pola kanonicznego ATA. Dostępne operacje: `read`, `refund`, `surplus`, `close`, `prepare`, `fund`. `fund` wymaga klucza uczestnika przez `--payer-env NAZWA_SEKRETU`.

CLI zachowuje sygnaturę w publicznym pliku potwierdzenia przed wysłaniem. Timeout pozostawia wynik `unknown`. Najpierw sprawdź starą sygnaturę i stan cyklu. Nie wysyłaj automatycznie nowej transakcji. Po udokumentowanym wygaśnięciu starej, nadal nieznanej transakcji CLI wymaga jawnego `--retry-after-check`. Potwierdzenie finansowe zawiera ponowny odczyt cyklu i salda.

## Devnet, Convex i wydanie

Publiczna konfiguracja jest w `.env.example`. Nie dodawaj sekretów z prefiksem `VITE_`: ten prefiks trafia do przeglądarki. Baza ofert działa pod `https://academic-mole-172.convex.cloud`; serwer i klient sprawdzają podpisy Ed25519, domenę, pełny genesis hash, Program ID, nonce, ważność i podpisane wycofania. Baza nie jest źródłem należności. Import/eksport i recovery działają bez niej.

Poniższe komendy aktualizacji dotyczą kluczy istniejącego projektu. Repozytorium ich nie zawiera. **Nowo wygenerowane klucze w świeżym klonie mają inne adresy** i nie wdrożą programu pod naszym Program ID. Własne wdrożenie przygotuj procedurą [„Własne adresy w świeżym klonie”](docs/release.md#własne-adresy-w-świeżym-klonie), z własnym publicznym adresem i własną tablicą Convex. Lokalny validator nie potrzebuje klucza naszego programu.

```powershell
psst SWAPCIRCLE_CONVEX_DEPLOY_KEY -- powershell -File packages/matching/scripts/deploy-convex.ps1
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_PROGRAM_KEY -- pnpm deploy:devnet
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_BOB_KEY SWAPCIRCLE_DEVNET_CELINE_KEY SWAPCIRCLE_DEVNET_RECOVERY_KEY -- pnpm seed:devnet
psst SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_BOB_KEY SWAPCIRCLE_DEVNET_CELINE_KEY SWAPCIRCLE_DEVNET_RECOVERY_KEY -- pnpm verify:devnet
```

Deployment wymaga testowego SOL na wydzielonym płatniku. Seed tworzy dX/dY/dZ (0 decimals) i dSIX (6 decimals), wydaje zapas, odbiera mint authority i potwierdza brak freeze authority. Powtórne uruchomienie zachowuje istniejące minty. Skrypty blokują mainnet.

Finalne wydanie ma osobny Program ID. Procedura `scripts/release.mjs` przygotowuje oddzielny, sprawdzalny artefakt, wdraża go jako aktualizowalny i wymaga pełnych wyników devnet przed odebraniem authority. Odebranie jest nieodwracalne i wymaga osobnego polecenia z dokładnym Program ID. Po nim trzeba ponowić odbiór. Nie jest częścią zwykłego deployu ani uruchomienia aplikacji. Zobacz [instrukcję wydania](docs/release.md).

GitHub Actions wykonuje testy i build. Osobny workflow `publish-web` publikuje statyczny frontend przez GitHub Pages. Publiczne adresy i zweryfikowany status publikacji znajdują się w `submission/links.json`, gdy publikacja zostanie ukończona.

## Granice gwarancji

- Wcześniejsze depozyty pozostają zablokowane do sukcesu lub deadline. Ostatni uczestnik może nie wpłacić. Sam upływ czasu nie wysyła transakcji zwrotu.
- Refund zwraca dokładne tokeny, nie opłaty sieci, utracone możliwości ani ich wartość pieniężną. Rent rekordu cyklu pozostaje; rent pustych vaultów wraca do zapisanego płatnika.
- Obsługiwany jest klasyczny SPL Token Program, bez freeze authority i wrapped SOL. Token-2022, rozszerzenia i szczególne standardy NFT są odrzucane. Aktywna mint authority jest jawnym ryzykiem podaży.
- Salda ofert są chwilowym odczytem i nie rezerwują tokenów. Dopiero prawidłowa wpłata ustala należność. Darowizna do vaultu nie finansuje nogi.
- Jeśli program ma upgrade authority, jej właściciel może zmienić kod. UI odczytuje ten stan z sieci. Brak funkcji administratora nie jest dowodem niezmienności.
- To implementacja demonstracyjna z testowymi aktywami. Nie ma niezależnego audytu ani potwierdzonego popytu. Publiczne adresy, kwoty i terminy są widoczne w sieci.

## Struktura i licencja

`programs/` to program Anchor, `packages/sdk/` to jeden klient WWW i CLI, `packages/matching/` to podpisy i dokładny graf, `convex/` to adapter tablicy, `apps/web/` to React, `scripts/` to narzędzia operacyjne, `tests/` i `docs/evidence/` to próby oraz dowody, `submission/` to pakiet materiałów.

Anchor 1.1.2, Agave 3.1.10, Rust 1.96.0, legacy web3.js 1.99.0, React 19.1.1, Vite 6.3.6. Konkretne zależności są w Cargo.lock, pnpm-lock.yaml i obrazie z digestem. Bazę środowiska wskazuje komentarz z przypiętym commitem kursu Superteam w Dockerfile.

Kod projektu: MIT, autor Michał Kiełtyka / DEFOZO SOFTWARE HOUSE. Zależności zachowują własne licencje. Oryginalne materiały zadania, dostępne w lokalnym `official-2026-10-03`, nie są kodem projektu ani częścią jego licencji. Przygotowanie materiałów nie oznacza wysłania zgłoszenia do HackTribe.
