"""Package the reviewed pitch without modifying its presentation or media."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', type=Path, default=ROOT / 'submission/pitch/SwapCircle-demo.mp4')
    args = parser.parse_args()
    review = json.loads((ROOT / 'docs/evidence/pitch-release-review.json').read_text(encoding='utf-8'))
    if review.get('complete') is not True:
        raise ValueError('The final presentation and film need a completed review')
    sources = {
        'README.md': ROOT / 'submission/README.md',
        'TEAM.json': ROOT / 'TEAM.json',
        'description.md': ROOT / 'submission/description.md',
        'SwapCircle.pdf': ROOT / 'submission/pitch/SwapCircle.pdf',
        'SwapCircle.pptx': ROOT / 'submission/pitch/SwapCircle.pptx',
        'SwapCircle-demo.mp4': args.video.resolve(),
        'speaker-notes.txt': ROOT / 'submission/pitch/speaker-notes.txt',
        'links.json': ROOT / 'submission/links.json',
    }
    for name in ['narration-pl.txt', 'captions-pl.vtt', 'audio-credits.md', 'media-provenance.json', 'audio-verification.json']:
        path = ROOT / 'submission/pitch' / name
        if path.exists():
            sources[name] = path
    snapshots = {name: path.read_bytes() for name, path in sources.items()}
    digest = lambda content: sha256(content).hexdigest()
    for name in ['SwapCircle.pdf', 'SwapCircle.pptx', 'SwapCircle-demo.mp4']:
        if digest(snapshots[name]) != review['files'][name]['sha256']:
            raise ValueError(f'{name} changed after review')
    team = json.loads(snapshots['TEAM.json'])
    if team['team_name'] != 'DEFOZO SOFTWARE HOUSE' or team['members'] != ['Michał Kiełtyka']:
        raise ValueError('Unexpected team')
    for name, data in snapshots.items():
        if name.endswith(('.md', '.txt', '.json', '.vtt')) and re.search(r'(?<![A-Za-z])[A-Za-z]:[\\/]|/Users/|/home/|BEGIN [A-Z ]*PRIVATE KEY', data.decode('utf-8-sig')):
            raise ValueError(f'Private path or key marker in {name}')
    manifest = {
        'project': 'SwapCircle', 'team': team['team_name'], 'members': team['members'],
        'packagedAt': datetime.now(timezone.utc).isoformat(),
        'mode': 'Demo: interactive simulation',
        'files': {name: {'bytes': len(data), 'sha256': digest(data)} for name, data in snapshots.items()},
    }
    snapshots['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    destination = ROOT / '.local/SwapCircle-package.zip'
    destination.parent.mkdir(exist_ok=True)
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in snapshots.items():
            archive.writestr(name, data)
    with ZipFile(destination) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(snapshots):
            raise ValueError('Archive validation failed')
        for name, data in snapshots.items():
            if archive.read(name) != data:
                raise ValueError(f'Archive bytes differ: {name}')
    for name, path in sources.items():
        if path.read_bytes() != snapshots[name]:
            raise ValueError(f'Source changed during packaging: {name}')
    report = {**manifest, 'archive': destination.relative_to(ROOT).as_posix(), 'bytes': destination.stat().st_size,
              'sha256': digest(destination.read_bytes()), 'crcAndByteReadbackPassed': True, 'complete': True}
    (ROOT / 'docs/evidence/pitch-package.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ['archive', 'bytes', 'sha256', 'complete']}))


if __name__ == '__main__':
    main()
