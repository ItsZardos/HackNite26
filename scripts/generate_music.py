"""Render eight original, seamless 16-second ambient loops; Python standard library only."""
import math, wave, array
from pathlib import Path
RATE=22050
DURATION=16
N=RATE*DURATION
ROOT=Path(__file__).resolve().parents[1]/'public'/'music'
# MIDI chords; all loops share a tonal center for harmonious crossfades.
MOODS={'calm':([48,55,60,64,67],.08),'happy':([48,52,55,60,64],.25),'hopeful':([48,55,59,62,67],.16),'melancholy':([45,52,57,60,64],.10),'mysterious':([45,52,58,59,64],.18),'tense':([45,48,52,58,64],.65),'dark':([33,40,45,46,52],.12),'triumphant':([48,55,60,64,72],.4)}
ROOT.mkdir(parents=True,exist_ok=True)
for mood,(notes,energy) in MOODS.items():
    freqs=[round(440*2**((note-69)/12)*DURATION)/DURATION for note in notes]
    samples=array.array('h')
    for i in range(N):
        t=i/RATE
        pad=sum(math.sin(2*math.pi*f*t + j*.4)*(1+.18*math.sin(2*math.pi*(j+1)*t/DURATION)) for j,f in enumerate(freqs))*.062
        beat=.5 if energy>.3 else 1.
        step=int(t/beat);age=t%beat;f=freqs[(step*2)%len(freqs)]*2
        # Attack and release both reach zero, preventing note-boundary clicks.
        env=(1-math.exp(-age*35))*math.exp(-age*5)*min(1,(beat-age)/.04)
        bell=(math.sin(2*math.pi*f*age)+.2*math.sin(2*math.pi*f*2*age))*env*.13
        pulse=math.sin(2*math.pi*(round(freqs[0]*.5*DURATION)/DURATION)*t)*(.5+.5*math.cos(2*math.pi*t*2))**8*energy*.16
        sample=max(-.95,min(.95,pad+bell+pulse))
        samples.append(int(sample*26000))
    with wave.open(str(ROOT/(mood+'.wav')),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(RATE);out.writeframes(samples.tobytes())
    print(mood)
