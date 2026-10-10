# Batch neural text-to-speech for narration. Build machine only: the app itself stays offline.
# Usage: python scripts/neural_batch.py <voice> <rate> <jobs.json>
#   voice      Microsoft neural voice name, e.g. ar-SA-ZariyahNeural
#   rate       speaking rate, e.g. -10% (a little slower is clearer for young children)
#   jobs.json  [{"text": "...", "out": "path/to/file.mp3"}, ...]
#
# Backend (same voices, same output either way):
#   - AZURE_SPEECH_KEY + AZURE_SPEECH_REGION set -> official Azure AI Speech REST API (SSML).
#   - otherwise -> edge-tts (`pip install edge-tts`), Microsoft Edge's "Read Aloud" service, no key.
# Jobs that fail after retries are reported and skipped; the caller treats them as missing.
import asyncio
import json
import os
import sys
import urllib.request
from xml.sax.saxutils import escape

CONCURRENCY = 4
RETRIES = 5


def progress(i, n):
    if i % 25 == 0 or i == n:
        print(f"  {i}/{n}", flush=True)


async def edge_all(voice, rate, jobs):
    import edge_tts

    sem = asyncio.Semaphore(CONCURRENCY)
    done = 0
    failed = []

    async def one(job):
        nonlocal done
        async with sem:
            for attempt in range(1, RETRIES + 1):
                try:
                    await edge_tts.Communicate(job["text"], voice, rate=rate).save(job["out"])
                    break
                except Exception as e:  # network hiccups and throttling are common; retry with backoff
                    # A refused request still leaves an empty file behind; never let it pass as a clip.
                    if os.path.exists(job["out"]) and os.path.getsize(job["out"]) == 0:
                        os.remove(job["out"])
                    if attempt == RETRIES:
                        failed.append((job["text"], str(e)))
                        break
                    await asyncio.sleep(1.5 * attempt)
            done += 1
            progress(done, len(jobs))

    await asyncio.gather(*(one(j) for j in jobs))
    return failed


def azure_all(voice, rate, jobs, key, region):
    lang = "-".join(voice.split("-")[:2])
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    failed = []
    for i, job in enumerate(jobs, 1):
        ssml = (
            f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{lang}">'
            f'<voice name="{voice}"><prosody rate="{rate}">{escape(job["text"])}</prosody></voice></speak>'
        )
        req = urllib.request.Request(
            url,
            data=ssml.encode("utf-8"),
            method="POST",
            headers={
                "Ocp-Apim-Subscription-Key": key,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                "User-Agent": "rawda-audio-render",
            },
        )
        for attempt in range(1, RETRIES + 1):
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    with open(job["out"], "wb") as f:
                        f.write(res.read())
                break
            except Exception as e:
                if attempt == RETRIES:
                    failed.append((job["text"], str(e)))
                    break
                import time

                time.sleep(1.5 * attempt)
        progress(i, len(jobs))
    return failed


def main():
    voice, rate, jobs_path = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(jobs_path, encoding="utf-8") as f:
        jobs = json.load(f)
    key, region = os.environ.get("AZURE_SPEECH_KEY"), os.environ.get("AZURE_SPEECH_REGION")
    if key and region:
        print(f"  backend: Azure AI Speech ({region}), voice {voice}, rate {rate}", flush=True)
        failed = azure_all(voice, rate, jobs, key, region)
    else:
        print(f"  backend: edge-tts, voice {voice}, rate {rate}", flush=True)
        failed = asyncio.run(edge_all(voice, rate, jobs))
    for text, err in failed:
        print(f"  FAILED: {text!r}: {err}", file=sys.stderr)
    if failed:
        print(f"  {len(failed)} line(s) failed; re-run to retry them.", file=sys.stderr)


if __name__ == "__main__":
    main()
