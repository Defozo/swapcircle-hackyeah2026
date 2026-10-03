"""Original SwapCircle instrumental. No samples, API calls or external music.

Usage: python compose_music.py OUTPUT.wav
Requires numpy, soundfile and FFmpeg. Composition and synthesis code follows
the repository MIT license. Source sample rate is 48 kHz stereo, 104 BPM.
"""
import argparse
import math
from pathlib import Path
import subprocess
import tempfile
import numpy as np
import soundfile as sf

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('output',type=Path)
args=parser.parse_args()
SR=48000;duration=180;beat=60/104
mix=np.zeros((duration*SR,2),dtype=np.float32)
chords=[(57,60,64,67),(53,57,60,64),(48,55,60,64),(55,59,62,67)]
def hz(midi):return 440*2**((midi-69)/12)
def add(signal,start,amplitude,pan=0):
    i=round(start*SR);n=min(len(signal),len(mix)-i)
    if n<=0:return
    mix[i:i+n,0]+=signal[:n]*amplitude*math.sqrt((1-pan)/2)
    mix[i:i+n,1]+=signal[:n]*amplitude*math.sqrt((1+pan)/2)
for bar in range(math.ceil(duration/(4*beat))):
    start=bar*4*beat;chord=chords[(bar//2)%4]
    t=np.arange(round(4.35*beat*SR),dtype=np.float32)/SR
    env=np.minimum(t/.32,1)*np.minimum(np.maximum(4.35*beat-t,0)/.75,1)
    for j,note in enumerate(chord):
        f=hz(note);pad=(np.sin(2*np.pi*f*t)+.12*np.sin(2*np.pi*f*2*t))*env
        add(pad,start,.055,[-.45,.28,-.15,.5][j])
    for k in range(8):
        note=chord[[0,2,1,3,2,1,3,2][(k+bar%2)%8]]+12
        t=np.arange(round(.75*SR),dtype=np.float32)/SR
        env=np.minimum(t/.012,1)*np.exp(-t*6.8)
        tone=(np.sin(2*np.pi*hz(note)*t)+.08*np.sin(2*np.pi*hz(note)*2*t))*env
        accent=.042 if k%2==0 else .025
        add(tone,start+k*.5*beat,accent,.25 if k%2 else -.25)
        add(tone,start+k*.5*beat+beat*.75,accent*.16,-.25 if k%2 else .25)
    for k in [0,2]:
        t=np.arange(round(.33*SR),dtype=np.float32)/SR
        pulse=np.sin(2*np.pi*(hz(chord[0]-12)*t+.45*(1-np.exp(-t*35))))*np.exp(-t*10)*np.minimum(t/.007,1)
        add(pulse,start+k*beat,.055)
fade=np.minimum(np.arange(len(mix))/SR/1.5,1)*np.minimum(np.maximum(duration-np.arange(len(mix))/SR,0)/3,1)
mix*=fade[:,None]
args.output.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='swapcircle-music-') as tmp:
    raw=Path(tmp)/'original.wav';sf.write(raw,mix,SR,subtype='PCM_24')
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-af','loudnorm=I=-33:TP=-9:LRA=4',
                    '-ar',str(SR),'-c:a','pcm_s24le',str(args.output.resolve())],check=True)
print(args.output.resolve())
