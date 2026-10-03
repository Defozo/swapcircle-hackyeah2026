# Zapisane pomiary i ich zakres

Poniższe liczby pochodzą z wykonanych testów z 3 października 2026. Nie są
pomiarami devnet ani kosztów produkcyjnych. Bajty dotyczą całej serializowanej
transakcji legacy, a CU wykonania instrukcji zapisanej w danym raporcie.

## Program SBF w LiteSVM

| Artefakt | Uczestnicy | Create: bajty / CU | Ostatnia wpłata: bajty / CU |
| --- | --- | --- | --- |
| Rozwojowy `0425e951…e5af137` | 4 | 854 / 72 831 | 802 / 79 896 |
| Osobny finalny kandydat `dc944653…846a6bf9` | 4 | 854 / 71 331 | 802 / 84 396 |

Źródła: [measurements.json](../tests/program/measurements.json),
[measurements-final.json](../tests/program/measurements-final.json),
[dowód testów rozwojowych](evidence/program-tests.json) i
[dowód testów finalnego kandydata](evidence/program-final-tests.json).
Ostatnia wpłata w tym teście ma osobnego płatnika opłaty oraz podpis właściciela.
Dlatego jej rozmiar różni się od transakcji poniższego klienta RPC, gdzie właściciel
sam płaci opłatę. Wyniki mieszczą się w limicie 1232 bajtów bez rozdzielania
końcowych przekazań. Różne PDA i ich bump mogą powodować różnice w CU.

Rent rekordu `Cycle` wynosi 3 807 120 lamportów. Rent pojedynczego vaultu wynosi
2 039 280 lamportów. Cztery vaulty i rekord wymagają razem 11 964 240 lamportów,
przed dodaniem opłat transakcyjnych i ewentualnych kont odbiorców. Cleanup zwraca
rent vaultów zapisanemu płatnikowi; rekord cyklu pozostaje.

## Rzeczywiste transakcje lokalnego validatora

Źródło: [localnet-flows.json](evidence/localnet-flows.json). Program i jego bajty
sprawdzono w [doctor-localnet.json](evidence/doctor-localnet.json).

| Operacja | Uczestnicy cyklu | Bajty | CU | Opłata, lamporty |
| --- | --- | --- | --- | --- |
| Utworzenie cyklu | 4 | 854 | 73 413 | 5 000 |
| Ostatnia wpłata i cała wymiana | 4 | 706 | 82 630 | 5 000 |
| Niezależny refund do istniejącego konta | 3 | 343 | 19 786 | 5 000 |
| Refund i atomowe utworzenie nowego konta zastępczego | 3 | 568 | 22 910 | 10 000 |

Raport zawiera też pozostałe wpłaty, cleanup, cykle 2 i 3 stron oraz czasy
`confirmed` i `finalized` dla każdej transakcji. Cykl czterech stron obejmuje
utworzenie, cztery wpłaty i cztery zamknięcia vaultów: dziewięć transakcji,
łącznie 45 000 lamportów opłat w tym przebiegu. Wszystkie 29 zapisanych operacji
kosztowało łącznie 150 000 lamportów opłat. Te sumy nie obejmują wcześniejszego
seedowania, emisji tokenów i przygotowania demonstracyjnych rachunków.

Fallback tworzy rachunek należący do właściciela tokenów. Jego rent jest oddzielnym
kosztem płatnika tworzenia i nie daje temu płatnikowi prawa do późniejszego
zamknięcia rachunku.

## Cztery strony, brakujące ATA i dwa niezależne refundy

Osobny test `four_party_missing_atas_and_independent_refund_measurement` wykonał
rzeczywisty program SBF oraz programy SPL Token i Associated Token w LiteSVM.
Zaczyna od czterech nieistniejących ATA odbiorców, tworzy je prawdziwą instrukcją
`CreateIdempotent`, sprawdza owner/mint i zerowe saldo, po czym finansuje dwie nogi.
Dokładnie w deadline zwraca pierwszą do istniejącego ATA, a drugą do świeżego
konta utworzonego i zainicjalizowanego w tej samej transakcji co refund. Weryfikuje
dokładne kwoty, pośredni stan `Refunding`, końcowy `Refunded`, brak delegata i close
authority oraz odrzucenie powtórnych zwrotów. Właściciele nie podpisują refundów.

Źródło: [measurements-refund.json](../tests/program/measurements-refund.json),
artefakt rozwojowy `0425e951…e5af137`.

| Operacja, cykl 4 stron | Bajty | Unikalne konta | CU | Opłata, lamporty | Nowy rent, lamporty |
| --- | --- | --- | --- | --- | --- |
| Utworzenie cyklu i vaultów | 854 | 13 | 71 331 | 5 000 | 11 964 240 |
| Utworzenie wszystkich 4 brakujących ATA | 654 | 16 | 83 288 | 5 000 | 8 157 120 |
| Pojedyncza sponsorowana wpłata, dwie wykonane | 802 | 18 | 33 763 | 10 000 | 0 |
| Refund do istniejącego ATA | 343 | 7 | 21 340 | 5 000 | 0 |
| Fresh account i refund atomowo | 568 | 10 | 25 962 | 10 000 | 2 039 280 |

Konta oznaczają unikalne klucze wiadomości, włącznie z programami i płatnikiem.
Opłata wynika z faktycznego zmniejszenia salda lamportów płatnika pomniejszonego
o odczytany rent nowo utworzonych kont. Nie jest wartością wpisaną do raportu
z kalkulatora. Fresh fallback używa `InitializeAccount`, dokładnie jak obecny SDK;
dwa podpisy należą do płatnika i nowego adresu konta, nie do nieobecnego właściciela.
Sześć wykonanych transakcji kosztowało łącznie 45 000 lamportów opłat i utworzyło
konta z 22 160 640 lamportami rent. Scenariusz nie zamyka tych kont.

Oryginalny przebieg RPC miał już wszystkie ATA z seedowania, dlatego nie zawiera
`prepare-ATAs`. Powyższy niezależny pomiar domyka ten wariant na rzeczywistym SBF;
nie jest przedstawiany jako dodatkowa transakcja lokalnego RPC ani devnet.

Ten sam scenariusz przeszedł także dla osobnego finalnego kandydata
`dc944653…846a6bf9`. [measurements-refund-final.json](../tests/program/measurements-refund-final.json)
zapisuje 93 788 CU dla utworzenia czterech ATA, 18 340 CU dla refundu do ATA i
22 962 CU dla atomowego fresh fallback. Bajty, liczby kont, opłaty i rent są takie
same jak w tabeli. Ponownie są to wyniki LiteSVM, a finalny kandydat nie został
przez ten test wdrożony na devnet.

Starszy lokalny validator usunął część historii po zakończeniu testu. Raport
zachowuje wyniki odczytane w czasie wykonania oraz jawny wynik późniejszej kontroli.
Nie daje to ponownie dostępnych historycznych pokwitowań. Finalne wydanie devnet
wymaga nowych przebiegów i wszystkich aktualnie dostępnych dowodów.
