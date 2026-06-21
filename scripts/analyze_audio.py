#!/usr/bin/env python3
"""
Local audio analysis via librosa.
Returns precise BPM, duration, energy-based section boundaries, key, TikTok window.
No API calls — runs fully offline.
"""
import sys
import json
import numpy as np
import librosa

def analyze(filepath):
    y, sr = librosa.load(filepath, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    # BPM via beat tracking
    hop_length = 512
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    bpm = float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)
    beat_times_raw = librosa.frames_to_time(beats, sr=sr, hop_length=hop_length)
    beat_times = [round(float(t), 3) for t in beat_times_raw.tolist()]

    # Per-beat onset strength (0..1) — lets the video director cut exactly on
    # strong percussive accents instead of the extrapolated tempo grid.
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_max = float(np.max(onset_env)) if np.max(onset_env) > 0 else 1.0
    beat_strength = []
    for f in beats:
        lo = max(0, int(f) - 2)
        hi = min(len(onset_env), int(f) + 3)
        peak = float(np.max(onset_env[lo:hi])) if lo < hi else 0.0
        beat_strength.append(round(peak / onset_max, 3))

    # Key signature via chroma
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_idx = int(np.argmax(np.mean(chroma, axis=1)))
    keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    key = keys[key_idx]

    # RMS energy envelope (reuses hop_length defined above)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop_length)[0]
    max_rms = float(np.max(rms)) if np.max(rms) > 0 else 1.0

    # Section boundary detection via MFCC agglomerative segmentation
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)
    n_segments = min(12, max(4, int(duration / 20)))
    boundary_frames = librosa.segment.agglomerative(mfcc, n_segments)
    boundary_times = librosa.frames_to_time(boundary_frames, sr=sr, hop_length=hop_length)

    raw_boundaries = sorted(set(
        [0.0] + [round(float(t), 3) for t in boundary_times] + [round(duration, 3)]
    ))

    def classify_energy(ratio):
        if ratio < 0.28:   return "low"
        if ratio < 0.52:   return "medium"
        if ratio < 0.76:   return "high"
        return "peak"

    sections = []
    for i in range(len(raw_boundaries) - 1):
        start = raw_boundaries[i]
        end   = raw_boundaries[i + 1]
        if end - start < 3.0:
            continue
        f0 = librosa.time_to_frames(start, sr=sr, hop_length=hop_length)
        f1 = librosa.time_to_frames(end,   sr=sr, hop_length=hop_length)
        seg_rms  = float(np.mean(rms[f0:f1])) if f0 < f1 else 0.0
        ratio    = seg_rms / max_rms
        sections.append({
            "startSec":  round(start, 3),
            "endSec":    round(end, 3),
            "energy":    classify_energy(ratio),
            "rmsRatio":  round(ratio, 3),
        })

    # Best 30-second TikTok window (highest mean energy)
    best_start, best_score = 0, 0.0
    window = 30
    for t in range(0, int(duration) - window, 2):
        f0 = librosa.time_to_frames(t,          sr=sr, hop_length=hop_length)
        f1 = librosa.time_to_frames(t + window, sr=sr, hop_length=hop_length)
        score = float(np.mean(rms[f0:f1]))
        if score > best_score:
            best_score, best_start = score, t

    return {
        "duration":           round(duration, 3),
        "bpm":                round(bpm, 1),
        "key":                key,
        "sections":           sections,
        "beatTimes":          beat_times,
        "beatStrength":       beat_strength,
        "tiktokBestStartSec": round(float(best_start), 3),
        "tiktokBestEndSec":   round(min(float(best_start) + 30.0, duration), 3),
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: analyze_audio.py <filepath>"}))
        sys.exit(1)
    try:
        result = analyze(sys.argv[1])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
