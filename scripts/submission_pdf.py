"""Rebuild the 10-slide submission PDF from the verified evidence files."""
import json
from xml.sax.saxutils import escape
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'submission'; OUT.mkdir(exist_ok=True)
FONT=Path('C:/Windows/Fonts/segoeui.ttf')
if not FONT.exists(): FONT=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
BOLD=FONT.with_name('segoeuib.ttf') if FONT.name=='segoeui.ttf' else FONT.with_name('DejaVuSans-Bold.ttf')
pdfmetrics.registerFont(TTFont('Deck',str(FONT)))
pdfmetrics.registerFont(TTFont('DeckBold',str(BOLD)))
def read(path,default):
    p=ROOT/path
    return json.loads(p.read_text(encoding='utf-8-sig')) if p.exists() else default
dev=read('docs/evidence/devnet-flows.json',{})
local=read('docs/evidence/localnet-flows.json',{})
evidence=dev if dev.get('complete') else local
environment='Solana devnet' if dev.get('complete') else 'Lokalny validator Solany'
manifest=read('deployments/devnet.json',{})
team=read('TEAM.json',{'team_name':'','members':[]})
slides=[
 ('SwapCircle','Wymiana, która domyka krąg',[('intro','Podpisane oferty i wymiana tokenów pomiędzy 2-4 osobami. Uczestnicy wpłacają niezależnie. Ostatnia wpłata wykonuje wszystkie przekazania.')], 'Naszym odbiorcą są małe społeczności Solany. Szukamy wymian, których nie udaje się dopasować parami. Program zastępuje powiernika depozytów.'),
 ('Problem','Każda osoba ma coś dla kogoś innego', [('table',[['Osoba','Oddaje','Potrzebuje'],['Alicja','100 dX','40 dY'],['Bartek','40 dY','250 dZ'],['Celina','250 dZ','100 dX']]),('body','Żadna para nie spełnia obu potrzeb. Wymiana sekwencyjna wymaga zaufania do pierwszego odbiorcy. Powiernik przejmuje kontrolę nad wszystkimi depozytami.')], 'Kwoty są uzgodnione, nie wynikają z kursu. dX, dY i dZ są testowymi tokenami bez wartości pieniężnej. Ten zestaw służy do sprawdzenia mechanizmu, nie dowodzi popytu.'),
 ('Dopasowanie','Trzy potrzeby, jeden cykl',[('table',[['Przepływ tokenów','Dokładna ilość'],['Alicja do Celiny','100 dX'],['Celina do Bartka','250 dZ'],['Bartek do Alicji','40 dY']]),('body','Wyszukiwarka porównuje mint i dokładną ilość. Sprawdza podpisy, sieć, ważność i wycofania. Szuka cykli 2-4 różnych właścicieli.')], 'Uruchamiamy wyszukiwanie na tych samych ofertach. Kierunek grafu oznacza kierunek tokenów. Odnaleziony cykl zaspokaja potrzeby wszystkich trzech osób.'),
 ('Aplikacja','Od oferty do potwierdzonego wyniku',[('image','docs/evidence/ui-desktop.png'),('body','Portfel podpisuje ofertę, a później osobną transakcję wpłaty. Widok cyklu pokazuje dokładne warunki, termin blokady, koszty SOL i aktualny stan sieci.')], 'W tym miejscu pokazujemy aplikację na żywo. Podpis wiadomości publikuje ofertę i nie daje prawa do transferu. Uczestnik akceptuje konkretny cykl dopiero przez własną wpłatę.'),
 ('Reguły programu','Ostatnia wpłata rozlicza cały cykl',[('body','Przed terminem program przyjmuje dokładne, autoryzowane depozyty. Po ostatniej wpłacie wykonuje wszystkie transfery w tej samej transakcji.'),('body','Błąd któregokolwiek przekazania cofa ostatnią transakcję wraz z ostatnim depozytem. Wcześniejsze wpłaty zachowują prawo do zwrotu.'),('code','fund_and_maybe_settle(index, expected_hash)')], 'To miejsce, w którym znika powiernik. Program sprawdza podpis, minty, konta, właścicieli i hash warunków. Nie ma osobnego przycisku administratora zatwierdzającego wypłaty.'),
 ('Brak uczestnika','Niezależny zwrot po terminie',[('body','Po deadline dowolny płatnik może opłacić zwrot jednej wpłaconej nogi. Tokeny zawsze otrzymuje jej pierwotny właściciel.'),('body','Uszkodzone ATA nie blokuje prawa do środków. SDK może atomowo utworzyć bezpieczne konto tego samego właściciela i wykonać zwrot.'),('body','Publiczny pakiet odzyskiwania i CLI działają bez tablicy ofert oraz hostingu aplikacji.')], 'Drugi scenariusz używa wcześniej przygotowanego cyklu z brakującą wpłatą. Jeden zwrot wykonujemy w aplikacji, drugi z niezależnego klienta. Nie potrzebujemy podpisu twórcy ani nieobecnej strony.'),
 ('Kontrola','Kto może zmienić warunki',[('body','Warunki cyklu są niezmienne. Program nie ma administracyjnej wypłaty, zmiany odbiorcy ani przedłużenia terminu.'),('body','Status uprawnień do aktualizacji pochodzi z ProgramData. Dopóki upgrade authority istnieje, autor może zmienić kod.'),('body','Finalne odebranie authority wymaga osobnego, zweryfikowanego wydania. Aktualny status jest jawny w aplikacji i manifeście.')], 'Brak funkcji admina nie jest tym samym co brak uprawnienia do aktualizacji. Na pokazie odczytujemy właściwy program z sieci. Nie deklarujemy niezmienności, której nie potwierdza odczyt.'),
 ('Dowody','Wyniki wykonanych prób',[('evidence',None)], 'Pokazujemy wynik wykonania, stan cyklu i salda. Sygnatura wysłania sama nie dowodzi sukcesu. Lokalne testy i transakcje devnet są rozróżnione.'),
 ('Koszty i potrzeba','Asynchroniczność ma cenę',[('body','Depozyt pozostaje zablokowany do sukcesu lub terminu. Ostatnia osoba może nie wpłacić. Zwrot tokenów nie obejmuje opłat sieci ani utraconych możliwości.'),('body','Wspólna transakcja podpisana jednocześnie przez wszystkie strony unika tej blokady. SwapCircle ma sens, jeśli niezależne wpłaty są dla społeczności warte tego kosztu.'),('body','Popyt pozostaje hipotezą. Następny krok to porównanie dopasowań i akceptowalnego czasu blokady na ofertach rzeczywistych użytkowników.')], 'Nie obiecujemy najlepszej ceny ani płynności. Nasza gwarancja dotyczy dokładnych tokenów i zapisanych reguł. Decyzja o wartości tej wygody należy do użytkowników.'),
 ('Dostęp','Kod, aplikacja i odzyskiwanie',[('links',None)], 'Kod zawiera program, SDK, algorytm, frontend i niezależne narzędzia. Uruchomienie oraz ograniczenia opisuje README. W zgłoszeniu używamy wyłącznie sprawdzonych publicznych adresów i potwierdzonych wyników.')
]
W,H=1280,720
c=canvas.Canvas(str(OUT/'SwapCircle.pdf'),pagesize=(W,H));c.setTitle('SwapCircle | Finance Without Intermediaries');c.setAuthor(team.get('team_name') or 'SwapCircle')
bg=HexColor('#0c1424');white=HexColor('#f0f4f9');muted=HexColor('#abb9ce');accent=HexColor('#b8ef6c')
def text(value,x,y,size=25,color=white,font='Deck',width=1112):
    style=ParagraphStyle('deck',fontName=font,fontSize=size,leading=size*1.38,textColor=color)
    p=Paragraph(str(value),style);_,height=p.wrap(width,1000);p.drawOn(c,x,y-height);return y-height-28
notes=[]
for number,(section,title,content,note) in enumerate(slides,1):
    c.setFillColor(bg);c.rect(0,0,W,H,fill=1,stroke=0)
    text(section.upper(),84,658,15,accent,font='DeckBold')
    y=text(title,84,610,43,font='DeckBold')-18
    for kind,value in content:
        if kind in ('intro','body'):y=text(value,84,y,29 if kind=='intro' else 25)
        elif kind=='code':y=text(value,84,y,22,accent)
        elif kind=='table':
            for rownum,row in enumerate(value):
                columns=len(row);columnwidth=1112/columns
                for col,cell in enumerate(row):text(cell,84+col*columnwidth,y,23,accent if rownum==0 else white,font='DeckBold' if rownum==0 else 'Deck',width=columnwidth-24)
                y-=56
            y-=20
        elif kind=='image':
            image=ROOT/value
            if image.exists():
                # Place the actual offer cards at a readable size. Clip the PDF
                # drawing to this region; the source screenshot is unchanged.
                source=ImageReader(str(image));iw,ih=source.getSize()
                sx,sy,sw,sh=iw*0.19,ih*0.54,iw*0.78,ih*0.29
                scale=min(1112/sw,300/sh);width,height=sw*scale,sh*scale
                left=84+(1112-width)/2;bottom=y-height
                c.saveState();clip=c.beginPath();clip.rect(left,bottom,width,height);c.clipPath(clip,stroke=0)
                c.drawImage(source,left-sx*scale,bottom-(ih-sy-sh)*scale,width=iw*scale,height=ih*scale)
                c.restoreState();y-=height+28
        elif kind=='evidence':
            y=text(environment,84,y,30,accent,font='DeckBold')
            if evidence.get('complete'):
                y=text('Cykle 2, 3 i 4 stron zakończone. Ilości i salda potwierdzone odczytem sieci.',84,y)
                y=text('Niezależny zwrot na nowe konto tego samego właściciela. Opłatę ponosi trzecia osoba.',84,y)
                measurements=evidence.get('transactions',[])
                largest=max((r.get('bytes',0) for r in measurements),default=0)
                cu=max((r.get('computeUnits',0) or 0 for r in measurements),default=0)
                y=text(f'Największa zmierzona transakcja: {largest} B. Maksimum w badanych próbach: {cu:,} CU.',84,y,23)
            else:y=text('Raport wykonania jest w trakcie przygotowania. Brak kompletnego odbioru sieciowego.',84,y)
            if not dev.get('complete'):y=text('Devnet: pełna ścieżka nie została jeszcze potwierdzona.',84,y,21,muted)
        elif kind=='links':
            links=read('submission/links.json',{})
            for label,keyname in [('Aplikacja','app'),('Repozytorium','repository'),('Film','video')]:
                value=links.get(keyname)
                shown=escape(value) if value else 'adres publikacji oczekuje na weryfikację'
                if value:
                    shown=f'<link href="{escape(value)}" color="#b8ef6c">{shown}</link>'
                y=text(f'{label}: {shown}',84,y,22)
            y=text('Program: '+manifest.get('programId','brak manifestu'),84,y,19,muted)
            y=text('Zespół: '+(team.get('team_name') or 'dane oczekują na uzupełnienie'),84,y,23)
            if team.get('members'):y=text(', '.join(team['members']),84,y,21,muted)
    if y<65:raise ValueError(f'Slide {number} content overflows: {y}')
    c.setFont('Deck',14);c.setFillColor(muted);c.drawString(84,35,'SwapCircle / Finance Without Intermediaries');c.drawRightString(W-84,35,f'{number} / 10')
    c.showPage();notes.append(f'{number}. {title}\n{note}\n')
c.save();(OUT/'speaker-notes.txt').write_text('\n'.join(notes),encoding='utf-8')
print(OUT/'SwapCircle.pdf')
