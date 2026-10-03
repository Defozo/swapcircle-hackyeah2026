# Dowody wymagane przed finalizacją i publikacją

`release.mjs finalize` oraz `release.mjs publish` odczytują trzy niezależne pliki.
Sam wynik testów lokalnych, flaga `complete` albo podpis testowego adaptera nie
spełniają tej bramki. Wszystkie pliki muszą wskazywać devnet, ten sam genesis,
finalny Program ID i hash przygotowanego ELF.

| Dowód | Domyślny plik | Opcja zmiany ścieżki |
| --- | --- | --- |
| Cykle 2/3/4 i niezależne zwroty | `docs/evidence/devnet-flows.json` | `--evidence` |
| CLI z samym publicznym pakietem | `docs/evidence/devnet-independent-cli.json` | `--recovery-evidence` |
| Ręczny odbiór publicznej aplikacji w Phantom i Solflare | `docs/evidence/devnet-browser-wallets.json` | `--wallet-evidence` |

Przed odebraniem authority skrypt porównuje rzeczywiste bajty ProgramData z ELF,
sprawdza aktualny slot wdrożenia i odczytuje pokwitowania `finalized` bez błędu.
Transakcje muszą pochodzić z późniejszego slotu niż ostatnie wdrożenie programu;
ten sam slot nie rozstrzyga kolejności wdrożenia i operacji. Skrypt odczytuje też
żywe PDA cykli, ich stany i bitmapy, oraz sprawdza faktyczne instrukcje zawarte
w transakcjach. Brak pokwitowania, także po usunięciu historii RPC, blokuje wydanie.

Po odebraniu authority wymagane są nowe przebiegi wszystkich trzech odbiorów,
rozpoczęte później niż zapisane `finalizedAt`. Publikacja dodatkowo wymaga
odczytanej pustej authority. Publiczny adres aplikacji musi zwracać HTML przez
HTTPS bez przekierowania. Jest to kontrola dostępności, a nie zastępstwo ręcznego
odbioru interfejsu. Skrypt archiwizuje trzy raporty i ich hashe wraz z wydaniem.

## Niezależne CLI

Po seedowaniu finalnego programu uruchom:

```powershell
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_RECOVERY_KEY -- pnpm verify:recovery --manifest deployments/devnet.json --recovery-rpc https://ALTERNATIVE_DEVNET_RPC
```

Wybierz rzeczywisty, działający endpoint HTTPS tego samego devnet, różny od RPC
użytego do przygotowania scenariusza. Ewentualnych poufnych kluczy RPC nie zapisuj
w publicznym raporcie. Skrypt tworzy oddzielnego właściciela, celowo zmienia jego
ATA, a potem uruchamia recovery w nowym katalogu i procesie bez klucza właściciela,
manifestu, WWW i Convex. Dziecko dostaje publiczny pakiet i klucz obcego płatnika.

Raport ma `version: 1`, `kind: "swapcircle-independent-cli"`, `startedAt`,
`completedAt`, `artifactHash`, `sourceRpc` i `recoveryRpc`, poza polami finansowymi
już emitowanymi przez skrypt. Nie należy uzupełniać brakujących pól historycznego
raportu, aby udawać nową próbę. Trzeba wykonać aktualną wersję skryptu.

Bramka sprawdza, że właściciel nie podpisał refundu, płatnik jest inną osobą,
ta sama transakcja tworzy i inicjalizuje świeże konto SPL dla uprawnionego
właściciela oraz wykonuje refund właściwej nogi. Metadane transakcji muszą dowodzić
dokładnego przyrostu salda tego właściciela. Bieżące konto nie może mieć delegata,
zamrożenia ani obcej close authority.

## Rzeczywiste portfele w publicznej aplikacji

Ten plik powstaje dopiero po ręcznej próbie. Nie jest generowany przez Playwright,
testowego signera ani sam kod programu. Osoba obserwująca zapisuje swoje nazwisko
lub uzgodniony identyfikator, dokładne wersje rozszerzeń i publiczne sygnatury.

1. Otwórz publiczny frontend pod HTTPS. Zaimportuj lub opublikuj podpisane oferty,
   sprawdź wyszukiwanie i utwórz cykl co najmniej trzech różnych właścicieli w UI.
2. Użyj oddzielnych profili przeglądarki. Każdy właściciel podpisuje własną wpłatę.
   W całej próbie muszą zostać użyte zarówno Phantom, jak i Solflare.
3. Zamknij sesję twórcy przed ostatnią wpłatą. Sprawdź rozliczenie i salda oraz
   możliwość ponownego odczytu cyklu po odświeżeniu.
4. W osobnym niedokończonym cyklu po terminie podpisz refund z rzeczywistego
   portfela uczestnika. Sprawdź stan i saldo. Osobny raport CLI dowodzi dodatkowo
   zwrotu bez podpisu właściciela.

Struktura raportu poniżej jest przykładem do wypełnienia, nie dowodem wykonania:

```json
{
  "version": 1,
  "kind": "swapcircle-browser-wallets",
  "complete": false,
  "network": "devnet",
  "genesisHash": "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  "programId": "FINAL_PROGRAM_ID",
  "artifactHash": "REVIEWED_ELF_SHA256",
  "startedAt": "ACTUAL_ISO_TIMESTAMP",
  "completedAt": "ACTUAL_ISO_TIMESTAMP",
  "manual": true,
  "observedBy": "ACTUAL_HUMAN_OBSERVER",
  "publicAppUrl": "https://PUBLIC_FRONTEND/",
  "offersImported": true,
  "matchingVerified": true,
  "refreshVerified": true,
  "creatorSessionClosedBeforeFinalFund": true,
  "settlementCycle": "SETTLED_CYCLE_PDA",
  "creationSignature": "UI_CREATE_SIGNATURE",
  "runs": [
    {
      "wallet": "Phantom",
      "walletVersion": "ACTUAL_VERSION",
      "browserProfile": "participant-1",
      "owner": "PARTICIPANT_PUBLIC_KEY",
      "cycle": "SETTLED_CYCLE_PDA",
      "operation": "fund",
      "leg": 0,
      "signature": "FINALIZED_FUND_SIGNATURE",
      "balancesVerified": true
    }
  ]
}
```

`runs` zawiera wpis dla każdej nogi wspólnego rozliczonego cyklu oraz co najmniej
jeden wpis `operation: "refund"` z osobnego cyklu. Uzupełnij rzeczywiste dane
pozostałych osób, w tym Solflare. Nie kopiuj jednej sygnatury pod inne nogi.
`complete: true` wolno zapisać dopiero po zakończeniu wszystkich prób.

Skrypt sprawdza podpisy uczestników, instrukcje i nogi wskazane przez sygnatury,
różne profile uczestników oraz końcowe stany cykli. Łańcuch nie identyfikuje marki
rozszerzenia ani tego, czy ktoś widział ekran. Te fakty pozostają jawnym
oświadczeniem wymienionego obserwatora, a nie wnioskiem z samych sygnatur.

## Kontrola kodu bramki

Nowy `release prepare` wymaga czystego repozytorium z istniejącym commitem,
również bez nieśledzonych plików. Zapisuje commit oraz porównanie każdego pliku
przygotowanego źródła z tym commitem. `deploy`, `finalize` i `publish` ponownie
sprawdzają to powiązanie przed kontaktem z RPC.

Istniejący kandydat został zbudowany przed utworzeniem repozytorium Git.
Jego historyczne `commit: null` nie jest przepisywane na późniejszy commit.
Po zapisaniu i przeglądzie ostatecznego commitu wykonaj najpierw kontrolę:

```sh
node scripts/release.mjs bind-source --release target/releases/Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4/release.json --commit FULL_40_CHARACTER_COMMIT
```

Powtórzenie tego polecenia z `--execute` zapisuje `sourceCommit` i
`sourceProvenance`. Nie buduje ani nie wdraża programu. Skrypt wymaga identycznej
listy plików i treści, dopuszczając wyłącznie zamianę deweloperskiego Program ID
na końcowy ID w `declare_id!` i `Anchor.toml` oraz równoważność zakończeń linii
CRLF/LF. Zachowuje pierwotne daty i hashe artefaktów. Jeśli kod się różni, trzeba
przygotować i odebrać nowy artefakt; nie wolno dopisywać commitu ręcznie.

Finalny manifest otrzymuje zweryfikowany `sourceCommit` jako `commit`.
Publiczny `release.json` zachowuje osobno oryginalny commit kompilacji,
późniejsze powiązanie źródeł oraz czas jego weryfikacji. Samo powiązanie nie
stanowi nowej kompilacji ani niezależnego dowodu odtwarzalności pliku ELF.

`node --test tests/release-provenance.test.mjs` sprawdza rzeczywiste repozytoria
Git: brudny katalog, istniejący kandydat, jawne przekształcenia Program ID i linii,
zmianę źródła, zmianę listy plików i zachowanie oryginalnego `commit: null`.

`tests/sdk/release-evidence.test.ts` sprawdza odrzucenie starego wdrożenia,
niedostępnego pokwitowania, podpisu nieobecnego właściciela, niewłaściwej kwoty,
testowego odbioru portfela, brakującego Solflare i powtórzonego profilu. Kontroluje
też powtórzenie prób po finalizacji. Są to testy walidacji na kontrolowanych
odpowiedziach RPC. Nie zastępują testów SBF, devnet ani ręcznej próby portfeli.
