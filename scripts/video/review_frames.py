"""Extract output-timed review evidence. This is not a claim of full playback."""
import hashlib
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
work = root / 'submission' / '_video_work'
review = work / 'review'
review.mkdir(exist_ok=True)
film = root / 'submission' / 'demo-localnet.mp4'
plan = json.loads((work / 'montage-plan.json').read_text(encoding='utf-8'))
entries = []
cursor = 0.0
for index, item in enumerate(plan['items']):
    seconds = item['frames'] / 30
    for position, at in [('start', cursor + 0.1), ('middle', cursor + seconds / 2), ('end', cursor + seconds - 0.1)]:
        if at < cursor:
            continue
        output = review / f'{index:02}-{position}-{at:.2f}.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-threads', '2', '-y', '-ss', str(at), '-i', str(film), '-frames:v', '1', str(output)], check=True, capture_output=True)
        entries.append({'time': at, 'file': output.name, 'position': position, 'caption': item.get('caption', 'Title card')})
    cursor += seconds
midpoints = [entry for entry in entries if entry['position'] == 'middle']
columns = 3
rows = (len(midpoints) + columns - 1) // columns
sheet = Image.new('RGB', (columns * 640, rows * 390), '#eeeeee')
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 18)
for index, entry in enumerate(midpoints):
    x, y = index % columns * 640, index // columns * 390
    image = Image.open(review / entry['file']).convert('RGB').resize((640, 360))
    sheet.paste(image, (x, y))
    draw.text((x + 8, y + 364), f'{entry["time"]:.2f}s', font=font, fill='black')
sheet.save(review / 'contact-sheet.png')
(review / 'frame-index.json').write_text(json.dumps({'candidate': str(film), 'sha256': hashlib.sha256(film.read_bytes()).hexdigest(), 'plan': str(work / 'montage-plan.json'), 'coverage': 'Every edit segment start/midpoint/end. Still frames do not establish continuity of motion.', 'audio': 'Intentionally silent. No intelligibility claim.', 'frames': entries}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'frames': len(entries), 'contact_sheet': str(review / 'contact-sheet.png')}))
