"""Preserve native PowerPoint PDF pages and attach the two source PPTX links."""
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Link

root = Path(__file__).resolve().parents[2]
source = root / '.state/pitch-build/SwapCircle-v3.pdf'
target = root / 'submission/pitch/SwapCircle.pdf'
reader = PdfReader(source)
writer = PdfWriter()
writer.clone_document_from_reader(reader)
assert len(reader.pages) == 9
scale = float(reader.pages[8].mediabox.width) / 1280
def link_rect(x, y, width, height):
    return (x * scale, (720-y-height) * scale, (x+width) * scale, (720-y) * scale)
writer.add_annotation(page_number=8, annotation=Link(rect=link_rect(72, 431, 1136, 56), url='https://defozo.github.io/swapcircle-hackyeah2026/'))
writer.add_annotation(page_number=8, annotation=Link(rect=link_rect(72, 529, 1136, 53), url='https://github.com/Defozo/swapcircle-hackyeah2026'))
with target.open('wb') as stream:
    writer.write(stream)
print(f'Wrote {target.name} with 9 native pages and 2 link annotations')
