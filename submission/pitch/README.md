# Film SwapCircle

Film ma 108 sekund. Pokazuje działające interaktywne demo: trzy oferty bez zgodnej pary, znaleziony krąg, warunki, niezależne wpłaty, wspólne rozliczenie i osobny scenariusz zwrotów. Tryb Demo jest widoczny przez cały film. Nagranie nie jest przedstawiane jako transakcje Devnet.

- `narration-pl.txt`: pełny polski tekst lektora.
- `captions-pl.vtt`: 26 krótkich napisów na osi czasu filmu, do publicznego odtwarzacza.
- `media-provenance.json`: pochodzenie obrazu, głosu i muzyki oraz identyfikatory sprawdzonego filmu.
- `../../scripts/video/pitch/capture.mjs`: rzeczywiste kliknięcia w aplikacji i zapis wideo.
- `../../scripts/video/pitch/compose_music.py`: autorska kompozycja i synteza podkładu.
- `../../scripts/video/pitch/reproduce.py`: render z utrwalonych źródeł, bez API i nowej generacji audio.

Materiały są dostępne w wydaniu `demo-pitch-2026-10-03` repozytorium `defozo/swapcircle-hackyeah2026`. Film to `SwapCircle-demo.mp4`, a źródła to `SwapCircle-video-sources.zip`.

Po rozpakowaniu archiwum:

```powershell
python scripts/video/pitch/reproduce.py PATH_TO_EXTRACTED_SOURCES --check-only
python scripts/video/pitch/reproduce.py PATH_TO_EXTRACTED_SOURCES
```

Wymagane są Python 3.11+, FFmpeg i ffprobe. Archiwum zawiera rzeczywiste nagranie ekranu, plansze, gotowy miks oraz osobne ścieżki głosu i muzyki. Skrypt sprawdza SHA-256 wejść i dekoduje wynik. Inna wersja kodeka może zmienić bajty pliku przy zachowaniu obrazu, dźwięku i czasu.

Głos jest gotowym głosem Bella z ElevenLabs, modelem `eleven_multilingual_v2`, wygenerowanym na płatnym koncie. Nie klonowano głosu użytkownika. Archiwum zawiera gotowe nagranie, nie model głosu. Wykorzystanie audio podlega odpowiednim warunkom ElevenLabs. Muzyka jest oryginalną lokalną kompozycją, bez cudzych nagrań i sampli. Kod kompozycji podlega licencji MIT repozytorium.
