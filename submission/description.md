# SwapCircle

Zespół: **DEFOZO SOFTWARE HOUSE**. Jedyny członek: **Michał Kiełtyka**.

SwapCircle pomaga małym społecznościom Solany znaleźć i wykonać wymiany klasycznych tokenów SPL, których nie da się dopasować bezpośrednimi parami. Użytkownik podpisuje ofertę z dokładnym mintem i ilością oddawanego oraz oczekiwanego tokena. Wyszukiwarka znajduje zgodne cykle 2-4 różnych właścicieli.

Powiernika przyjmującego i rozdzielającego depozyty zastępuje program Solany. Każdy uczestnik niezależnie podpisuje wpłatę do niezmiennego cyklu. Ostatnia poprawna wpłata przed terminem wykonuje wszystkie przekazania w jednej transakcji. Gdy zabraknie uczestnika, po terminie każdą wcześniejszą wpłatę można odzyskać bez zgody pozostałych stron lub operatora.

Zwrot pozostaje możliwy również na inne bezpieczne konto tokenowe tego samego właściciela, gdy jego ATA jest niedostępne. Publiczny pakiet odzyskiwania oraz SDK i CLI pozwalają wykonać operację bez tablicy ofert i hostingu aplikacji. Serwer odkrywania ofert nigdy nie przechowuje kluczy uczestników ani nie ustala należności.

Program gwarantuje dokładne ilości i odbiorców zaakceptowanego cyklu. Nie gwarantuje znalezienia partnerów, korzystnej ceny ani wartości rynkowej tokenów. Wcześniejszy depozyt pozostaje zablokowany do sukcesu lub deadline. Aktywne uprawnienie aktualizacji programu jest jawne w interfejsie. Demo korzysta z testowych tokenów bez wartości pieniężnej, a rzeczywisty popyt pozostaje hipotezą do walidacji.

Aktualny stan wdrożenia, wykonane testy i publiczne linki określają README, manifest oraz raporty w `docs/evidence`. Pakiet przygotowania nie oznacza wysłania zgłoszenia do HackTribe.
