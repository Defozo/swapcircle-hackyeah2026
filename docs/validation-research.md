# Zastosowanie i utrzymanie SwapCircle

SwapCircle obsługuje małe grupy posiadaczy klasycznych tokenów SPL, których potrzeby nie tworzą zgodnych par. Dla ofert Alicji, Bartka i Celiny pojedyncza para może nie istnieć, mimo że w całej grupie są wszystkie potrzebne tokeny. Cykl łączy wtedy dokładne tokeny i ilości 2-4 uczestników.

Każdy uczestnik widzi całą wymianę i podpisuje własną wpłatę. Uczestnicy mogą wpłacać niezależnie. Ostatnia poprawna wpłata przed terminem wykonuje końcowe przekazania atomowo. Ta wygoda wiąże się z blokadą wcześniejszych wpłat do sukcesu lub deadline. Gdy grupa może skoordynować wszystkie podpisy naraz, pojedyncza wspólnie podpisana transakcja jest alternatywą bez wcześniejszego blokowania depozytów.

## Wartość dla uczestnika i operatora

Uczestnik otrzymuje wyszukiwanie wielostronnego dopasowania, jawne warunki i niezależną ścieżkę odzyskiwania. Operator tablicy ofert nie przechowuje kluczy uczestników i nie ustala należności z depozytów. O należności decyduje program i zapisany stan cyklu.

Kod jest dostępny na licencji MIT. Wersja demonstracyjna nie pobiera prowizji protokołu i nie implementuje płatnego abonamentu. Podstawą wdrożenia dla społeczności jest własny hosting statycznego frontendu, tablica ofert Convex oraz dostęp do RPC. Koszty operatora dotyczą tych usług i utrzymania oprogramowania; użytkownicy lub wskazany płatnik ponoszą opłaty sieciowe i rent kont. Lokalne [pomiary](measurements.md) pozwalają odróżnić te koszty, lecz nie są cennikiem usług produkcyjnych.

## Praca operatora

Operator ustawia publiczne adresy sieci i programu, wdraża frontend oraz utrzymuje dostępność tablicy ofert i RPC. Aktualizacja kodu przechodzi testy, build i procedurę wydania. Zmiana programu ma własny Program ID albo podlega widocznemu upgrade authority. Klucze wdrożeniowe są przechowywane poza aplikacją.

Podpisane oferty można importować i eksportować. Uczestnik zachowuje publiczny pakiet odzyskiwania; CLI działa także bez hostingu WWW i Convex. Instrukcje instalacji, kontroli stanu oraz odzyskiwania są w [README](../README.md).

Demo pokazuje działanie na przykładowych ofertach i aktywach testowych. Nie jest ofertą inwestycyjną, gwarancją płynności ani deklaracją liczby klientów czy przychodów.
