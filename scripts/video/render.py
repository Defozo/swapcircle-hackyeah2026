"""Deterministic, silent edit of actual Playwright screen recordings.

All sources and captions remain in submission/_video_work. No generated product
states, stock footage, music, cloud service, or synthetic financial transaction.
"""
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'submission' / '_video_work'
RENDER = WORK / 'render'
RENDER.mkdir(parents=True, exist_ok=True)
CAPTIONS = WORK / 'captions'
CAPTIONS.mkdir(exist_ok=True)
FPS = 30
WIDTH, HEIGHT = 1920, 1080
font_path = Path('C:/Windows/Fonts/segoeui.ttf')
bold_path = Path('C:/Windows/Fonts/segoeuib.ttf')
font = lambda size, bold=False: ImageFont.truetype(str(bold_path if bold else font_path), size)

def run(args):
    if args[0] == 'ffmpeg':
        args[1:1] = ['-threads', '2', '-filter_threads', '1', '-filter_complex_threads', '1']
        args[-1:-1] = ['-threads', '2']
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(result.stderr[-12000:])
    return result.stdout

def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]))

def text_lines(draw, value, f, max_width):
    lines, current = [], ''
    for word in value.split():
        candidate = (current + ' ' + word).strip()
        if draw.textlength(candidate, font=f) > max_width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    return lines + [current]

def overlay(path, caption, speed):
    img = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, WIDTH, 59), fill='#122d28')
    draw.text((35, 10), 'SWAPCIRCLE  |  LOCALNET', font=font(29, True), fill='white')
    suffix = f'  |  tempo x{speed:g}' if speed > 1 else ''
    draw.text((600, 15), 'Rzeczywisty program Solana  |  automatyczne podpisy portfeli testowych' + suffix, font=font(23), fill='#d3eadd')
    draw.rectangle((0, 960, WIDTH, HEIGHT), fill='#122d28')
    lines = text_lines(draw, caption, font(30), 1830)
    if len(lines) > 2:
        raise ValueError('Caption longer than two readable lines')
    for index, line in enumerate(lines):
        draw.text((45, 976 + index * 41), line, font=font(30), fill='white')
    img.save(path)

def title(path, lines):
    img = Image.new('RGB', (WIDTH, HEIGHT), '#122d28')
    draw = ImageDraw.Draw(img)
    draw.rectangle((110, 150, 125, 900), fill='#a3dfbd')
    y = 190
    for line, size, color in lines:
        draw.text((180, y), line, font=font(size, size >= 44), fill=color)
        y += size + 32
    img.save(path)

capture = json.loads((WORK / 'manifests' / 'capture.json').read_text(encoding='utf-8'))
evidence = json.loads((WORK / 'manifests' / 'chain-evidence.json').read_text(encoding='utf-8'))
team = json.loads((ROOT / 'TEAM.json').read_text(encoding='utf-8-sig'))
assert capture['cluster'] == evidence['cluster'] == 'localnet'
assert evidence['settled']['state'] == 'Settled' and evidence['returned']['state'] == 'Refunded'
assert evidence['allFinalized']
durations = {scene['name']: float(probe(scene['video'])['format']['duration']) for scene in capture['scenes']}
# Keep complete recorded actions; transparently accelerate the whole capture only
# if needed for the requested three-minute submission limit.
speed = max(1, math.ceil(sum(durations.values()) / 156 * 10) / 10)
plan = {'title': 'SwapCircle: rzeczywista wymiana i zwrot na localnet', 'schema_version': 1,
        'timeline': {'width': WIDTH, 'height': HEIGHT, 'fps': FPS},
        'scope': 'Local validator, test tokens, automated test wallet adapter. Not devnet or a physical browser extension.',
        'editorial_rationale': 'Show signed exact matching, consent, atomic final deposit and independent expired refunds. Preserve every recorded transaction action.',
        'speed': speed, 'items': [], 'audio': None, 'transcription': 'not applicable: silent screen recording',
        'approved': True, 'approval': {'by': 'implementation agent', 'basis': 'Explicit delegated instruction to produce <=180s actual localnet demonstration; no new creative or publishing scope.', 'user_approved_each_edit': False}}
intro = CAPTIONS / 'intro.png'
title(intro, [('SwapCircle', 90, 'white'), ('Wymiana 2–4 osób bez depozytariusza', 48, '#a3dfbd'), ('Nagranie działającej aplikacji i programu Solana', 36, 'white'), ('LOCALNET · tokeny testowe · automatyczne podpisy testowe', 31, '#d3eadd'), (team['team_name'], 39, 'white'), (', '.join(team['members']), 33, '#d3eadd')])
ending = CAPTIONS / 'ending.png'
title(ending, [('Dokładne warunki. Wspólne rozliczenie.', 60, 'white'), ('Podpisane oferty → zgodny cykl → ostatnia wpłata rozlicza całość', 34, '#a3dfbd'), ('Brak kompletu wpłat → po terminie niezależne zwroty właścicielom', 34, '#a3dfbd'), ('Depozyt jest zablokowany do sukcesu albo deadline. Opłaty SOL pozostają.', 30, 'white'), ('Brak gwarancji płynności, ceny i popytu. Klasyczny SPL, 2–4 uczestników.', 30, 'white'), ('Pokaz: LOCALNET. Devnet i fizyczne rozszerzenie portfela nie są dowodem tego filmu.', 27, '#d3eadd'), (team['team_name'] + '  |  ' + ', '.join(team['members']), 30, 'white')])
segments = []
render_commands = []
def encode_still(path, seconds, name):
    out = RENDER / (name + '.mp4')
    render_commands.append(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-i', str(path), '-an', '-frames:v', str(seconds * FPS), '-r', str(FPS), '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p', str(out)])
    segments.append(out)
    plan['items'].append({'source': str(path.relative_to(ROOT)), 'frames': seconds * FPS, 'kind': 'authored title card'})

encode_still(intro, 6, '000-intro')
number = 1
for scene in capture['scenes']:
    chapters = scene['chapters']
    if not chapters:
        raise ValueError('A scene has no explanation')
    chapters[0]['at'] = 0
    duration = durations[scene['name']]
    for index, chapter in enumerate(chapters):
        start = chapter['at']
        end = chapters[index + 1]['at'] if index + 1 < len(chapters) else duration
        frames = math.floor((end - start) / speed * FPS)
        if frames < 1:
            continue
        caption = CAPTIONS / f'{number:03}.png'
        overlay(caption, chapter['text'], speed)
        out = RENDER / f'{number:03}-{scene["name"]}.mp4'
        render_commands.append(['ffmpeg', '-y', '-v', 'error', '-ss', str(start), '-t', str(end - start), '-i', scene['video'], '-loop', '1', '-i', str(caption), '-filter_complex', f'[0:v]setpts=(PTS-STARTPTS)/{speed},fps={FPS},pad=1920:1080:0:60:color=0x122d28[base];[base][1:v]overlay=0:0[out]', '-map', '[out]', '-an', '-frames:v', str(frames), '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p', str(out)])
        segments.append(out)
        plan['items'].append({'source': str(Path(scene['video']).relative_to(ROOT)), 'source_sha256': hashlib.sha256(Path(scene['video']).read_bytes()).hexdigest(), 'in_seconds': start, 'out_seconds': end, 'frames': frames, 'caption': chapter['text']})
        number += 1
encode_still(ending, 10, '999-ending')
plan_bytes = json.dumps(plan, ensure_ascii=False, indent=2).encode('utf-8')
(WORK / 'montage-plan.json').write_bytes(plan_bytes)
(WORK / 'plan-approval.json').write_text(json.dumps({'approved_plan_sha256': hashlib.sha256(plan_bytes).hexdigest(), **plan['approval']}, ensure_ascii=False, indent=2), encoding='utf-8')
for command in render_commands:
    run(command)
concat = RENDER / 'concat.txt'
concat.write_text('\n'.join("file '" + str(path).replace('\\', '/').replace("'", "'\\''") + "'" for path in segments), encoding='utf-8')
result = RENDER / 'demo-localnet.mp4'
run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat), '-c', 'copy', '-movflags', '+faststart', str(result)])
media = probe(result)
assert float(media['format']['duration']) <= 180, media['format']['duration']
assert media['streams'][0]['width'] == WIDTH and media['streams'][0]['height'] == HEIGHT
assert media['streams'][0]['avg_frame_rate'] == '30/1'
assert len(media['streams']) == 1, 'The film is intentionally silent'
run(['ffmpeg', '-v', 'error', '-i', str(result), '-f', 'null', '-'])
plan_bytes = json.dumps(plan, ensure_ascii=False, indent=2).encode('utf-8')
(WORK / 'montage-plan.json').write_bytes(plan_bytes)
(WORK / 'render-qc.json').write_text(json.dumps({'technical_check': 'passed', 'duration_seconds': media['format']['duration'], 'width': WIDTH, 'height': HEIGHT, 'fps': '30/1', 'audio': 'none', 'decoded_without_error': True, 'plan_sha256': hashlib.sha256(plan_bytes).hexdigest(), 'output_sha256': hashlib.sha256(result.read_bytes()).hexdigest(), 'source_scene_count': len(capture['scenes']), 'perceptual_review': 'pending'}, indent=2), encoding='utf-8')
shutil.copyfile(result, ROOT / 'submission' / 'demo-localnet.mp4')
print(json.dumps({'output': 'submission/demo-localnet.mp4', 'duration_seconds': media['format']['duration'], 'speed': speed, 'technical_qc': 'passed'}))
