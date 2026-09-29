#!/usr/bin/env python3
"""
Generate stand-in thunder sounds procedurally — no recordings, no licences.

    python godot/tools/make_thunder.py

Writes godot/audio/thunder_near_*.wav and thunder_far_*.wav (mono, 44.1 kHz,
16-bit). WeatherLab picks near/far by how long it waits after the flash.

Recipe per clip:
  crack   (near only) a burst of bright noise with a very fast decay, plus a
          few secondary crackles — the lightning channel itself
  rumble  brown noise, low-passed hard, shaped by several random swells
          (echoes off terrain / cloud) and a slow random tremolo (the roll)
Distant thunder has no crack, a softer attack, a lower cutoff, and runs
longer. Swap any file for a CC0 recording later; the wiring doesn't care.
"""
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "audio"


def lowpass(x: np.ndarray, cutoff: float, slope: float = 4.0) -> np.ndarray:
    """Smooth FFT low-pass: gain = 1 / (1 + (f/cutoff)^slope)."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1.0 / (1.0 + (f / cutoff) ** slope)
    return np.fft.irfft(spec, len(x))


def highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1.0 - 1.0 / (1.0 + (f / cutoff) ** 4)
    return np.fft.irfft(spec, len(x))


def slow_noise(n: int, rate_hz: float, rng: np.random.Generator) -> np.ndarray:
    """Smooth random curve in 0..1, wobbling about rate_hz times a second."""
    pts = max(4, int(n / SR * rate_hz) + 2)
    curve = np.interp(np.arange(n), np.linspace(0, n, pts), rng.random(pts))
    return lowpass(curve - curve.mean(), rate_hz) + curve.mean()


def thunder(seed: int, near: bool) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = rng.uniform(4.5, 6.5) if near else rng.uniform(6.0, 9.0)
    n = int(dur * SR)
    t = np.arange(n) / SR

    # Rumble: brown noise (integrated white), low-passed hard.
    brown = np.cumsum(rng.standard_normal(n))
    brown = highpass(brown, 25.0)  # drop DC drift and sub-audio wander
    rumble = lowpass(brown, 180.0 if near else 110.0, 3.0)
    rumble /= np.abs(rumble).max()

    # A few swells: echoes rolling back, each later one quieter.
    env = np.zeros(n)
    start = 0.02 if near else rng.uniform(0.15, 0.4)
    for i in range(rng.integers(3, 6)):
        at = start + i * rng.uniform(0.4, 1.3) + rng.uniform(0, 0.3)
        width = rng.uniform(0.4, 1.1) * (1 + i * 0.3)
        height = rng.uniform(0.6, 1.0) * (0.8 ** i)
        attack = np.clip((t - at) / (0.05 if near and i == 0 else 0.25), 0, 1)
        env += height * attack * np.exp(-np.maximum(t - at, 0) / width)
    env *= 0.55 + 0.45 * slow_noise(n, 6.0, rng)  # the roll
    env *= np.clip((dur - t) / 0.8, 0, 1)         # clean tail
    sig = rumble * env / env.max()

    if near:
        # The crack: bright noise, fast decay, then scattered crackles.
        crack = highpass(rng.standard_normal(n), 900.0)
        crack_env = np.exp(-t / 0.07) * (t < 0.6)
        for _ in range(rng.integers(3, 7)):
            at = rng.uniform(0.03, 0.45)
            crack_env += rng.uniform(0.2, 0.6) * np.exp(-np.maximum(t - at, 0) / 0.02) * (t >= at)
        crack = lowpass(crack, 5000.0) * crack_env
        # Balanced against the rumble's loudness, not its own peak: noise
        # peaks run far above its RMS, and peak-matching left the rumble
        # nearly silent after normalising.
        rumble_rms = np.sqrt(np.mean(sig[: int(2.0 * SR)] ** 2))
        crack_rms = np.sqrt(np.mean(crack[: int(0.3 * SR)] ** 2)) + 1e-9
        sig += crack * (rumble_rms * 0.8 / crack_rms)

    sig = np.tanh(sig * 2.2)                        # compress: a little grit, rumble up
    sig *= 0.89 / np.abs(sig).max()                 # peak at about -1 dBFS
    fade_in = np.clip(t / 0.005, 0, 1)              # no click at the start
    return sig * fade_in


def write_wav(path: Path, sig: np.ndarray) -> None:
    pcm = (sig * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


OUT.mkdir(exist_ok=True)
for i, seed in enumerate([11, 23, 37], 1):
    write_wav(OUT / f"thunder_near_{i}.wav", thunder(seed, near=True))
for i, seed in enumerate([41, 53, 67], 1):
    write_wav(OUT / f"thunder_far_{i}.wav", thunder(seed, near=False))
for p in sorted(OUT.glob("thunder_*.wav")):
    print(f"[thunder] {p.name}  {p.stat().st_size / 1e6:.1f} MB")
