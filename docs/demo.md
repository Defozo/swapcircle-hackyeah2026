# Pokaz SwapCircle

Przed pokazem uruchom `pnpm run doctor` i sprawdź raport transakcji, środki testowe w osobnych portfelach oraz authority programu. Publiczny devnet i lokalny validator są różnymi środowiskami. Nie przedstawiaj lokalnego przebiegu jako transakcji devnet.

1. Otwórz tablicę trzech podpisanych ofert. Alicja oddaje 100 dX i chce 40 dY. Bartek oddaje 40 dY i chce 250 dZ. Celina oddaje 250 dZ i chce 100 dX.
2. Wyszukaj cykle na żywo. W tym zbiorze nie ma zgodnej pary. Poprawny kierunek przekazywania tokenów to Alicja, Celina, Bartek, Alicja. Graf i tabela pokazują te same dane.
3. Z portfela inicjatora utwórz cykl z terminem pozostawiającym zapas na podpisy. Sprawdź kwoty, minty, odbiorców, opłaty i maksymalny czas blokady. Jeśli brakuje kont odbiorców, przygotuj je przed wpłatami.
4. Wykonaj pierwsze dwie wpłaty w dwóch oddzielnych portfelach. Pokaż, że żaden odbiorca nie otrzymał jeszcze tokenów kontrahenta. Zamknij sesję twórcy.
5. Trzeci portfel wpłaca. Ta transakcja wykonuje cały cykl. Otwórz jej sygnaturę w Explorerze, odczytaj `Settled` i końcowe salda.
6. Otwórz drugi, jawnie przygotowany wcześniej cykl z brakującą wpłatą i minionym terminem. Wykonaj refund. Drugi refund przeprowadź niezależnym CLI przy wyłączonej tablicy i WWW. Uszkodzone ATA obsłuż przez `--fresh-account`.
7. Odczytaj aktualną upgrade authority. Wyjaśnij blokadę do deadline i brak gwarancji wartości rynkowej tokenów. Syntetyczny zbiór ofert pokazuje mechanizm, nie dowodzi popytu.

Film zgłoszeniowy trwa najwyżej 3 minuty. Jego treść powinna pokazywać powyższe faktyczne operacje i jednoznacznie określać środowisko. Przy awarii sieci nazwij nagranie kopią awaryjną. Nie zastępuj nim planowanego pokazu na żywo.
