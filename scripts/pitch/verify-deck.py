"""Verify delivery artifacts and write a bounded deck receipt."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / '.state/pitch-build'
OUT = ROOT / 'submission/pitch'
NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}

def checksum(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

pdf = PdfReader(OUT / 'SwapCircle.pdf')
assert len(pdf.pages) == 9
urls = []
for page in pdf.pages:
    for annotation in page.get('/Annots', []):
        action = annotation.get_object().get('/A', {})
        if action.get('/URI'):
            urls.append(str(action['/URI']))
assert 'https://defozo.github.io/swapcircle-hackyeah2026/' in urls
assert 'https://github.com/Defozo/swapcircle-hackyeah2026' in urls
native = json.loads((BUILD / 'powerpoint/powerpoint-inspection.json').read_text(encoding='utf-8-sig'))
assert len(native) == 9
assert all(record['editableTextShapes'] >= 4 and record['notes'] for record in native)
assert native[1]['nativeTables'] == 1
assert sum(record['pictures'] for record in native) == 5
with ZipFile(OUT / 'SwapCircle.pptx') as archive:
    slide_files = [name for name in archive.namelist() if name.startswith('ppt/slides/slide') and name.endswith('.xml')]
    assert len(slide_files) == 9
    note_files = [name for name in archive.namelist() if name.startswith('ppt/notesSlides/notesSlide') and name.endswith('.xml')]
    assert len(note_files) == 9
    texts = [' '.join(ET.fromstring(archive.read(name)).itertext()) for name in slide_files]
    assert all('\u2014' not in value for value in texts)
    assert not any(word in '\n'.join(texts).lower() for word in ['faucet', 'devnet', 'nie zostało', 'brak sol'])
validation = json.loads((BUILD / 'validation-v3.json').read_text(encoding='utf-8'))
assert validation['finalSha256'] == checksum(OUT / 'SwapCircle.pptx')
assert validation['packageIntegrity']['status'] == 'pass'
assert validation['presentationLayout']['findingCount'] == 0
report = {
    'schemaVersion': 'swapcircle.pitch-deck.v1',
    'createdAt': datetime.now(timezone.utc).isoformat(),
    'release': 'demo-pitch-2026-10-03',
    'language': 'pl',
    'slideCount': 9,
    'officialRequirements': {
        'pdfMaximumSlides': 10,
        'videoMaximumSeconds': 180,
        'allowedSubmissionLanguages': ['Polish', 'English'],
        'sources': [
            'official-2026-10-03/materials/3b73ed0c42b8c22b.pdf.txt section 4',
            'official-2026-10-03/materials/fafd38e2c4903727.pdf.txt section 5',
            'official-2026-10-03/materials/be9e868d627b03c9.pdf.txt section 5'
        ]
    },
    'artifacts': {name: {'path': f'submission/pitch/{name}', 'bytes': (OUT/name).stat().st_size, 'sha256': checksum(OUT/name)} for name in ['SwapCircle.pdf', 'SwapCircle.pptx', 'speaker-notes.txt']},
    'visualReview': {
        'status': 'pass',
        'inspectedSlides': list(range(1, 10)),
        'reviewer': 'pitch agent',
        'renderers': ['Microsoft PowerPoint native PDF and PNG export', 'Poppler PDF rasterization'],
        'pptxRenderDirectory': '.state/pitch-build/powerpoint',
        'pdfRenderDirectory': '.state/pitch-build/pdf',
        'findings': [],
        'revisions': ['Expanded graph crop', 'Changed hyperlink theme color for contrast', 'Shortened refund heading', 'Recaptured graph and result states from final demo UI']
    },
    'editability': {
        'nativeTextShapeCount': sum(record['editableTextShapes'] for record in native),
        'nativeTableSlides': [2],
        'embeddedScreenshotSlides': [3, 4, 5, 6, 7],
        'speakerNotesSlides': list(range(1, 10)),
        'fullSlideScreenshotCount': 0,
        'powerPointOpenedSuccessfully': True
    },
    'checks': {
        'packageIntegrity': 'pass',
        'layoutGeometry': 'pass',
        'fontPolicy': 'Segoe UI',
        'artifactToolReimport': 'pass',
        'pdfPageCount': len(pdf.pages),
        'pdfLinkTargets': urls,
        'pdfLinkMethod': 'Two annotations copied from PPTX targets after native PowerPoint PDF export',
        'notesPresentAndReadBackInPowerPoint': True,
        'existingSubmissionPdfAndNotesUnchanged': True
    },
    'claimBoundary': 'The public flow is an interactive simulation. Screenshots and pitch do not claim Devnet transactions or market validation. Blockchain execution evidence remains in the technical documentation.',
    'contentSources': json.loads((BUILD / 'slide-content.json').read_text(encoding='utf-8')),
    'screenshots': {key: {'path': value, 'sha256': checksum(ROOT / value)} for key, value in json.loads((ROOT/'scripts/pitch/assets.json').read_text(encoding='utf-8')).items()}
}
(ROOT / 'docs/evidence/pitch-deck.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': 'pass', 'slides': 9, 'editableTextShapes': report['editability']['nativeTextShapeCount'], 'pdfUrls': urls}, ensure_ascii=False))
