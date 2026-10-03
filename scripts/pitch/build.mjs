import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RUNTIME = process.env.RUNTIME_NODE_MODULES;
const SKILL = process.env.PRESENTATIONS_SKILL_DIR;
const PYTHON = process.env.PRESENTATIONS_PYTHON || 'python';
if (!RUNTIME || !SKILL) throw new Error('Set RUNTIME_NODE_MODULES and PRESENTATIONS_SKILL_DIR for the installed Presentations toolchain. See scripts/pitch/README.md.');
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(RUNTIME, '@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL, 'container_tools/artifact_tool_utils.mjs')).href);
const BUILD = path.join(ROOT, '.state/pitch-build');
const OUT = path.join(ROOT, 'submission/pitch');
const REV = process.env.PITCH_REVISION || 'v3';
await fs.mkdir(BUILD, { recursive: true });
await fs.mkdir(OUT, { recursive: true });
const assets = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts/pitch/assets.json'), 'utf8'));
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const C = { bg: '#0C1424', white: '#F0F4F9', muted: '#ABB9CE', accent: '#B8EF6C' };
p.theme.colorScheme = { name: 'SwapCircle', themeColors: { accent1: C.accent, accent2: C.muted, accent3: '#DCC281', accent4: '#94A8E7', accent5: '#AEE5CC', accent6: '#E4AC9D', bg1: C.bg, bg2: '#181F29', tx1: C.white, tx2: C.muted, dk1: C.bg, dk2: '#181F29', lt1: C.white, lt2: C.muted, hlink: C.accent, folHlink: C.accent } };
const FONT = 'Segoe UI';
const notes = [];
const slideInfo = [];
function text(s, value, x, y, w, h, size = 30, color = C.white, bold = false) {
  const o = s.shapes.add({ geometry: 'textbox', name: `text-${s.shapes.items.length + 1}`, position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { fill: 'none', width: 0 } });
  o.text = value;
  o.text.style = { typeface: FONT, fontSize: size, color, bold, autoFit: 'none', wrap: 'square', verticalAlignment: 'top', insets: { top: 0, bottom: 0, left: 0, right: 0 } };
  return o;
}
function base(title, narrative, sources, demo = false) {
  const s = p.slides.add();
  s.background.fill = C.bg;
  const n = p.slides.items.length;
  if (title) text(s, title, 72, 60, 1136, 118, 46, C.white, true);
  if (n > 1) text(s, 'SwapCircle', 72, 664, 150, 26, 16, C.muted);
  text(s, `${n} / 9`, 1136, 664, 72, 26, 16, C.muted);
  if (demo) text(s, 'Demo. Tokeny dX, dY i dZ nie mają wartości pieniężnej.', 244, 664, 850, 26, 16, C.muted);
  const note = `${n}. ${title || 'SwapCircle'}\n\n${narrative}\n\nŹródła: ${sources.join('\n')}`;
  s.speakerNotes.textFrame.setText(note);
  notes.push(note);
  slideInfo.push({ number: n, title: title || 'SwapCircle', sources, demo });
  return s;
}
async function img(s, key, x, y, w, h, alt, crop) {
  const file = path.resolve(ROOT, assets[key]);
  s.images.add({ blob: await fs.readFile(file), contentType: 'image/png', alt, fit: crop ? 'cover' : 'contain', ...(crop ? {crop} : {}), position: { left: x, top: y, width: w, height: h } });
  slideInfo.at(-1).screenshot = path.relative(ROOT, file).replaceAll('\\', '/');
}
const plan = 'official-2026-10-03/PLAN.md, §3-4';
const program = 'https://github.com/Defozo/swapcircle-hackyeah2026/blob/main/programs/swapcircle/src/lib.rs';
const app = 'https://defozo.github.io/swapcircle-hackyeah2026/';
const repo = 'https://github.com/Defozo/swapcircle-hackyeah2026';

{
  const s = base('', 'W wymianie z obcą osobą ktoś zwykle musi wysłać pierwszy. W małej społeczności dochodzi jeszcze drugi problem: dwie oferty nie zawsze do siebie pasują. SwapCircle wyszukuje wymiany między dwiema, trzema lub czterema osobami i łączy je ze wspólnym rozliczeniem. Uczestnicy wpłacają niezależnie. Powiernika depozytów zastępuje program Solany.', [plan]);
  text(s, 'SwapCircle', 72, 100, 1136, 130, 92, C.accent, true);
  text(s, 'Wymiana tokenów\nbez powiernika depozytów', 72, 275, 1000, 152, 50, C.white, true);
  text(s, 'Dla małych społeczności Solany. Od 2 do 4 uczestników.', 76, 465, 1090, 54, 28, C.muted);
  text(s, 'DEFOZO SOFTWARE HOUSE\nMichał Kiełtyka', 76, 593, 1040, 66, 22, C.muted);
}
{
  const s = base('Trzy oferty bez zgodnej pary', 'Alicja oddaje sto dX i szuka czterdziestu dY. Bartek oferuje czterdzieści dY za dwieście pięćdziesiąt dZ. Celina ma dwieście pięćdziesiąt dZ i chce sto dX. Spójrzmy na dowolną parę: jedna z osób nie otrzyma tego, czego potrzebuje. Ale w całej grupie są już wszystkie potrzebne tokeny. To przykład demonstracyjny. Kwoty wynikają z ofert, a nie z wyceny rynku.', [plan], true);
  const values = [['Osoba', 'Oddaje', 'Chce otrzymać'], ['Alicja', '100 dX', '40 dY'], ['Bartek', '40 dY', '250 dZ'], ['Celina', '250 dZ', '100 dX']];
  const t = s.tables.add({ rows: 4, columns: 3, left: 72, top: 209, width: 1136, height: 292, columnWidths: [380, 380, 376], values });
  t.styleOptions = { headerRow: false, bandedRows: false };
  t.borders.assign({ style: 'solid', fill: C.bg, width: 1 });
  t.cells.block({ row: 0, column: 0, rowCount: 4, columnCount: 3 }).assign({ fill: C.bg, margins: { left: 0, right: 18, top: 14, bottom: 12 }, textStyle: { typeface: FONT, fontSize: 36, color: C.white }, anchor: 'center' });
  t.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 3 }).assign({ textStyle: { typeface: FONT, fontSize: 25, color: C.accent, bold: true } });
  text(s, 'W grupie są wszystkie potrzebne tokeny.', 72, 548, 1136, 62, 36, C.white, true);
}
{
  const s = base('Krąg łączy wszystkie potrzeby', 'Wyszukiwarka porównuje oferty i znajduje krąg. Alicja przekazuje sto dX Celinie. Celina przekazuje dwieście pięćdziesiąt dZ Bartkowi. Bartek przekazuje czterdzieści dY Alicji. Każda osoba dostaje dokładnie to, czego szukała. Ten sam mechanizm szuka zgodnych kręgów dwóch, trzech i czterech różnych właścicieli.', [plan, 'packages/matching/src/index.ts', 'apps/web/src/demo-state.ts'], true);
  await img(s, 'graph', 490, 228, 718, 349, 'Graf znalezionego kręgu w aplikacji SwapCircle', {left: .24, top: 0, right: .24, bottom: 0});
  text(s, '100 dX', 72, 210, 380, 72, 53, C.accent, true);
  text(s, 'Alicja przekazuje Celinie', 72, 281, 395, 48, 25);
  text(s, '250 dZ', 72, 350, 380, 72, 53, C.accent, true);
  text(s, 'Celina przekazuje Bartkowi', 72, 421, 405, 48, 25);
  text(s, '40 dY', 72, 490, 380, 72, 53, C.accent, true);
  text(s, 'Bartek przekazuje Alicji', 72, 561, 395, 48, 25);
}
{
  const s = base('Warunki widoczne przed wpłatą', 'Przed wpłatą uczestnik sprawdza, co oddaje, co otrzyma i do kiedy potrwa blokada. Warunki obejmują dokładne tokeny, ilości oraz odbiorców. W tym demo wybieramy dwie minuty. Wpłata oznacza akceptację konkretnego kręgu. Środki czekają do rozliczenia albo do chwili, w której można wystąpić o zwrot po terminie.', [plan, program], true);
  await img(s, 'terms', 655, 168, 553, 452, 'Okno z dokładnymi ilościami i zgodą na warunki wymiany');
  text(s, 'Wiesz, co oddajesz\ni co otrzymasz.', 72, 230, 540, 124, 39, C.white, true);
  text(s, 'Termin określa, jak długo\nmoże czekać Twój depozyt.', 72, 386, 540, 107, 29, C.muted);
  text(s, 'Akceptujesz warunki\nprzed zatwierdzeniem.', 72, 518, 540, 92, 29, C.accent);
}
{
  const s = base('Każdy wpłaca we własnym czasie', 'Alicja wpłaca pierwsza. Jej tokeny czekają w skarbcu programu. Później wpłaca Bartek. Oboje mogą odejść od aplikacji. Celina dołącza w swoim czasie, przed ustalonym terminem. Wcześniejsi uczestnicy nie muszą ponownie podpisywać wspólnego rozliczenia.', [program, 'apps/web/src/demo-state.ts'], true);
  await img(s, 'funding', 72, 203, 1136, 366, 'Dwie z trzech wpłat w scenariuszu demonstracyjnym');
  text(s, 'Wcześniejsi uczestnicy nie muszą ponownie podpisywać rozliczenia.', 72, 589, 1136, 50, 27, C.accent);
}
{
  const s = base('Ostatnia wpłata rozlicza cały krąg', 'Celina wykonuje ostatnią wpłatę. W tej samej transakcji program realizuje wszystkie uzgodnione przekazania. Alicja otrzymuje czterdzieści dY. Bartek dostaje dwieście pięćdziesiąt dZ, a Celina sto dX. Nie ma kolejnego zatwierdzenia przez operatora. Atomowość oznacza, że ostatnia wpłata i wszystkie transfery kończą się razem. Jeśli któryś transfer zawiedzie, ta transakcja nie wykona się częściowo.', [program, 'apps/web/src/demo-state.ts'], true);
  text(s, 'Wszystkie uzgodnione przekazania w jednej transakcji.', 72, 175, 1136, 56, 28, C.accent);
  await img(s, 'settled', 72, 253, 1136, 369, 'Rozliczony krąg i kwoty otrzymane przez wszystkich uczestników');
}
{
  const s = base('Niezależny zwrot po terminie', 'Drugi scenariusz: Alicja i Bartek wpłacili, ale Celina nie dołączyła. Po terminie nowe wpłaty są zamknięte. Alicja odbiera własne sto dX. Bartek oddzielnie odbiera czterdzieści dY. Żadne z nich nie potrzebuje zgody Celiny ani operatora. Reguła zwrotu kieruje tokeny do pierwotnego właściciela. Zwrot dotyczy tokenów depozytu, nie kosztów sieci.', [program, 'scripts/recover.ts'], true);
  text(s, 'Każdy osobno, bez zgody pozostałych uczestników.', 72, 189, 1136, 53, 29, C.accent);
  await img(s, 'refunded', 72, 265, 1136, 355, 'Wynik niezależnych zwrotów dla Alicji i Bartka');
}
{
  const s = base('Program przejmuje rolę powiernika', 'Wyszukiwarka pomaga odkryć wymianę, ale sama nie kontroluje aktywów. Program Solany sprawdza właściciela wpłaty i zaakceptowane warunki. Zarządza depozytami, wykonuje kompletne rozliczenie i dopuszcza zwrot po terminie. Operator aplikacji nie podejmuje decyzji o wypłacie. To powód użycia blockchaina: zwykła baza ofert nie może egzekwować tych transferów bez powierzenia komuś klucza do depozytów.', [program, 'official-2026-10-03/materials/3b73ed0c42b8c22b.pdf.txt, §2 i §5']);
  text(s, 'Dopasowanie', 72, 219, 530, 62, 37, C.accent, true);
  text(s, 'Oferty wskazują, kto może\nz kim utworzyć krąg.', 72, 309, 516, 118, 33);
  text(s, 'Wyszukiwarka nie otrzymuje\nkluczy do depozytów.', 72, 490, 516, 107, 27, C.muted);
  text(s, 'Rozliczenie', 692, 219, 516, 62, 37, C.accent, true);
  text(s, 'Program egzekwuje ilości,\nodbiorców i termin.', 692, 309, 516, 118, 33);
  text(s, 'Wypłata wynika z warunków\nzaakceptowanego kręgu.', 692, 490, 516, 107, 27, C.muted);
}
{
  const s = base('SwapCircle w Twojej społeczności', 'SwapCircle kierujemy do małych społeczności Solany, w których użytkownicy mają konkretne potrzeby wymiany klasycznych tokenów SPL. Publiczne SDK pozwala osadzić mechanizm w aplikacji społeczności. Następny krok to pilotaż na rzeczywistych ofertach i sprawdzenie, ile potrzeb dają się zaspokoić kręgami oraz jaki czas blokady użytkownicy akceptują. Teraz można otworzyć demo, przeprowadzić pełną wymianę i sprawdzić samodzielny zwrot.', [plan, repo]);
  text(s, 'Pełna wymiana od oferty do rozliczenia.\nOsobny scenariusz zwrotu po terminie.', 72, 205, 1136, 106, 36, C.white, true);
  text(s, 'Interaktywne Demo', 72, 376, 1136, 48, 29, C.accent, true);
  const demo = text(s, 'defozo.github.io/swapcircle-hackyeah2026', 72, 431, 1136, 56, 31, C.white);
  demo.text.get('defozo.github.io/swapcircle-hackyeah2026').link = { uri: app, isExternal: true };
  const repository = text(s, 'Kod i uruchomienie: github.com/Defozo/swapcircle-hackyeah2026', 72, 529, 1136, 53, 23, C.muted);
  repository.text.get('github.com/Defozo/swapcircle-hackyeah2026').link = { uri: repo, isExternal: true };
  text(s, 'DEFOZO SOFTWARE HOUSE   Michał Kiełtyka', 72, 607, 1136, 36, 22, C.muted);
}

const candidatePath = path.join(BUILD, `candidate-${REV}.pptx`);
const finalPath = path.join(OUT, `SwapCircle-${REV}.pptx`);
await (await PresentationFile.exportPptx(p)).save(candidatePath);
await fs.writeFile(path.join(OUT, 'speaker-notes.txt'), notes.join('\n\n\n'), 'utf8');
await fs.writeFile(path.join(BUILD, 'slide-content.json'), JSON.stringify(slideInfo, null, 2));
const result = await finalizePresentation({
  workspaceDir: ROOT, candidatePath, finalPath,
  pythonExecutable: PYTHON,
  integrityValidatorPath: path.join(SKILL, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(SKILL, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit', '--require-native-table-slide', '2'],
  explicitTotalSlideCount: 9,
  requiredNativeTableOwnerSlides: [2],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: 'design', families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(BUILD, `validation-${REV}.json`),
});
console.log(JSON.stringify({ finalPath, result }));
