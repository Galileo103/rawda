# Batch text-to-speech with Piper (https://github.com/rhasspy/piper, MIT).
# Usage: python scripts/piper_batch.py <model.onnx> <jobs.json>
# jobs.json = [{"text": "...", "out": "path/to/file.wav"}, ...]
# Loads the voice once and writes one WAV per job. Runs offline.
import json
import sys
import wave

from piper import PiperVoice

LENGTH_SCALE = 1.12  # slightly slower than default: clearer for young children


def synth(voice, text, wav_file):
    try:  # piper-tts >= 1.3
        from piper import SynthesisConfig

        voice.synthesize_wav(text, wav_file, syn_config=SynthesisConfig(length_scale=LENGTH_SCALE))
    except ImportError:  # piper-tts 1.2
        voice.synthesize(text, wav_file, length_scale=LENGTH_SCALE)


def main():
    model, jobs_path = sys.argv[1], sys.argv[2]
    voice = PiperVoice.load(model)
    with open(jobs_path, encoding="utf-8") as f:
        jobs = json.load(f)
    for i, job in enumerate(jobs, 1):
        with wave.open(job["out"], "wb") as wf:
            synth(voice, job["text"], wf)
        if i % 25 == 0 or i == len(jobs):
            print(f"  {i}/{len(jobs)}", flush=True)


if __name__ == "__main__":
    main()
