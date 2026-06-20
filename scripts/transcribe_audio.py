#!/usr/bin/env python3
"""
Local lyrics transcription via OpenAI Whisper.
Runs fully offline — no API calls.

Usage: python3 scripts/transcribe_audio.py <audio_file> [model]
  model: tiny | base | small | medium (default) | large-v3

CT100 deployment:
  pip3 install openai-whisper
  # Pre-download model (one-time, ~1.4 GB for medium):
  python3 -c "import whisper; whisper.load_model('medium')"
  # Model cache: ~/.cache/whisper/
"""
import sys
import json
import os
import warnings
warnings.filterwarnings("ignore")  # prevent PyTorch/tqdm warnings leaking into stdout

def transcribe(filepath, model_name="medium"):
    import whisper

    if not os.path.isfile(filepath):
        return {"error": f"File not found: {filepath}"}

    model = whisper.load_model(model_name)
    result = model.transcribe(
        filepath,
        task="transcribe",
        fp16=False,        # safer on CPU / MPS
        verbose=False,
    )

    text = result.get("text", "").strip()
    language = result.get("language", None)

    if not text:
        return {"lyrics": None, "language": language, "instrumental": True, "segments": []}

    # Format: one line per segment, double newline between pauses > 3s
    raw_segments = result.get("segments", [])
    # Keep segment timing for SRT generation (start/end in seconds, text)
    srt_segments = [
        {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
        for seg in raw_segments
        if seg.get("text", "").strip()
    ]

    if raw_segments:
        lines = []
        prev_end = None
        for seg in raw_segments:
            if prev_end is not None and seg["start"] - prev_end > 3.0:
                lines.append("")  # blank line between sections
            lines.append(seg["text"].strip())
            prev_end = seg["end"]
        formatted = "\n".join(lines)
    else:
        formatted = text

    return {"lyrics": formatted, "language": language, "instrumental": False, "segments": srt_segments}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe_audio.py <file> [model]"}))
        sys.exit(1)

    filepath = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "medium"

    try:
        out = transcribe(filepath, model_name)
        print(json.dumps(out))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
