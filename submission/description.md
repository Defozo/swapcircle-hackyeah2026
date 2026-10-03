# SwapCircle

Zespół: **DEFOZO SOFTWARE HOUSE**. Jedyny członek: **Michał Kiełtyka**.

W małej społeczności każdy może mieć token, którego potrzebuje ktoś inny, a mimo to żadna para nie dogada się na wymianę. Alicja oddaje 100 dX za 40 dY. Bartek oferuje 40 dY za 250 dZ. Celina ma 250 dZ i chce 100 dX. SwapCircle łączy te trzy potrzeby w jeden krąg.

Budujemy dla małych społeczności Solany wymieniających klasyczne tokeny SPL. Użytkownik określa, co oddaje i co chce otrzymać. Wyszukiwarka znajduje zgodne pary oraz kręgi 3-4 różnych właścicieli. Każdy widzi dokładne ilości, odbiorców i termin przed podjęciem decyzji.

W zwykłej wymianie grupowej powiernik zbiera depozyty i rozdziela tokeny. W SwapCircle tę rolę przejmuje program Solany. Uczestnicy wpłacają niezależnie, a ostatnia poprawna wpłata przed terminem uruchamia wszystkie transfery w jednej transakcji. Alicja otrzymuje 40 dY, Bartek 250 dZ, a Celina 100 dX. Operator aplikacji nie musi zatwierdzać wypłat.

Jeśli ktoś nie wpłaci, po upływie terminu każdy wcześniejszy depozyt można odzyskać oddzielnie. Zwrot nie potrzebuje zgody nieobecnego uczestnika ani operatora. Publiczne narzędzia odzyskiwania pozwalają wykonać tę operację także bez hostingu aplikacji. Wpłata pozostaje zablokowana do rozliczenia albo uzgodnionego terminu, więc ten warunek jest widoczny przed jej zatwierdzeniem.

Wartość SwapCircle polega na połączeniu dopasowania wielostronnego z wykonaniem uzgodnionej wymiany i samodzielnym wyjściem z niepełnego kręgu. Wyszukiwarka pomaga znaleźć kontrahentów, a program kontroluje depozyty i reguły przekazania aktywów. Zwykła baza ofert nie egzekwuje tych transferów.

Interaktywne Demo pokazuje cały przebieg: oferty, znaleziony krąg, akceptację warunków, niezależne wpłaty, rozliczenie i scenariusz zwrotu. Korzysta z symulowanych tokenów bez wartości pieniężnej. Repozytorium zawiera program, SDK, aplikację i instrukcję uruchomienia oraz dokumentację techniczną z wynikami testów.

Demo: https://defozo.github.io/swapcircle-hackyeah2026/

Repozytorium i uruchomienie: https://github.com/Defozo/swapcircle-hackyeah2026
