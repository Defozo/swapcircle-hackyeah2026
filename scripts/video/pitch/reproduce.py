"""Re-render the published SwapCircle video source archive without API calls.

Download SwapCircle-video-sources.zip from the demo-pitch-2026-10-03 release,
extract it, then run: python reproduce.py EXTRACTED_DIRECTORY
Use --check-only to verify every input hash without rendering.
Requires Python 3.11+, FFmpeg and ffprobe. No Python packages are needed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source_directory',type=Path)
parser.add_argument('--check-only',action='store_true')
args=parser.parse_args()
base=args.source_directory.resolve()
manifest=json.loads((base/'manifest.json').read_text(encoding='utf-8'))
def asset(relative):
    path=(base/relative).resolve()
    if not path.is_relative_to(base): raise ValueError('Asset leaves the source package')
    return path
for name,expected in manifest['assets'].items():
    actual=hashlib.sha256(asset(name).read_bytes()).hexdigest()
    if actual!=expected: raise ValueError(f'Asset hash mismatch: {name}')
print(f'Verified {len(manifest["assets"])} source assets.')
if args.check_only: raise SystemExit(0)
out=base/'generated';out.mkdir(exist_ok=True)
def run(command):
    result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace')
    if result.returncode: raise RuntimeError(result.stderr[-12000:])
segments=[]
for scene in manifest['scenes']:
    target=out/(scene['id']+'.mp4')
    cmd=['ffmpeg','-y','-v','error','-threads','2','-filter_threads','1','-filter_complex_threads','1']
    if scene['type']=='card':
        cmd+=['-loop','1','-i',str(asset(scene['image'])),'-an','-frames:v',str(scene['output_frames']),'-r','30']
    else:
        fps=scene['source_fps'];start=scene['source_in_frame']/fps
        seconds=(scene['source_out_frame']-scene['source_in_frame'])/fps
        cmd+=['-ss',str(start),'-t',str(seconds),'-i',str(asset(scene['source'])),'-loop','1','-i',str(asset(scene['overlay'])),
              '-filter_complex','[0:v]setpts=PTS-STARTPTS,scale=1920:1080:flags=lanczos,fps=30,setsar=1[base];[base][1:v]overlay=0:0[out]',
              '-map','[out]','-an','-frames:v',str(scene['output_frames']),'-r','30']
    cmd+=['-c:v','libx264','-profile:v','high','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','2',str(target)]
    run(cmd);segments.append(target)
concat=out/'concat.txt'
concat.write_text('\n'.join("file '"+p.as_posix().replace("'", "'\\''")+"'" for p in segments),encoding='utf-8')
output=out/'SwapCircle-demo-reproduced.mp4'
run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(concat),'-i',str(asset(manifest['audio_mix'])),
     '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-ac','2',
     '-t',str(manifest['duration_seconds']),'-movflags','+faststart',str(output)])
probe=json.loads(subprocess.run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(output)],capture_output=True,text=True,check=True).stdout)
video=next(s for s in probe['streams'] if s['codec_type']=='video')
assert int(video['nb_read_frames'])==manifest['output_frames']
assert abs(float(probe['format']['duration'])-manifest['duration_seconds'])<1/30
print(f'Rendered and decoded all {manifest["output_frames"]} frames: {output}')
