#!/usr/bin/env python3
"""Piper TTS sidecar for DevHub Zed voice replies."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
VOICES_DIR = SCRIPT_DIR / "voices"
DEFAULT_VOICE_NAME = "es_ES-davefx-medium"
DEFAULT_VOICE_PATH = VOICES_DIR / f"{DEFAULT_VOICE_NAME}.onnx"

SEARCH_BASES = (
    VOICES_DIR,
    Path.home() / ".local/share/piper/voices",
    Path("/usr/share/piper/voices"),
)

# `piper-tts` (the modern Python rewrite; the old C++ Piper CLI was archived
# 2025-10) defaults `--sentence-silence` to 0.0 -- i.e. ZERO gap between
# sentences -- instead of the 0.2s the classic Piper docs quote. For
# multi-sentence LLM replies that plays back as one rushed, breathless wall
# of speech, which is almost certainly the single biggest contributor to Zed
# sounding "robotic". `--length-scale` is left at Piper's own default (1.0)
# unless the caller asks for a different speaking rate.
def _env_float(name: str, fallback: float | None = None) -> float | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return fallback
    try:
        return float(raw)
    except ValueError:
        return fallback


DEFAULT_SENTENCE_SILENCE = _env_float("PIPER_SENTENCE_SILENCE", 0.45)
DEFAULT_LENGTH_SCALE = _env_float("PIPER_LENGTH_SCALE", 1.0)
# Noise knobs are left unset (None) unless explicitly configured -- we can't
# proof-listen these in CI, so we only override Piper/the voice model's own
# tuned defaults when a caller opts in.
DEFAULT_NOISE_SCALE = _env_float("PIPER_NOISE_SCALE")
DEFAULT_NOISE_W = _env_float("PIPER_NOISE_W")


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def find_piper() -> str | None:
    # sys.executable may resolve to the base Python (homebrew); venv scripts live under sys.prefix.
    for bin_dir in (Path(sys.prefix) / "bin", Path(sys.executable).resolve().parent):
        for name in ("piper", "piper-tts"):
            candidate = bin_dir / name
            if candidate.exists() and os.access(candidate, os.X_OK):
                return str(candidate)
    return shutil.which("piper") or shutil.which("piper-tts")


def resolve_voice_path(voice: str | None = None) -> tuple[str | None, str | None]:
    """Resolve a voice id/path to an .onnx file. Returns (path, error).

    `voice` may be a full/relative path to an .onnx file, a bare voice id
    (e.g. "es_AR-daniela-high"), or omitted -- in which case we fall back to
    $PIPER_VOICE, the bundled default, then any es_ES*.onnx found nearby.
    """
    requested = (voice or "").strip()

    if requested:
        as_path = Path(requested)
        if as_path.exists():
            return str(as_path), None
        for base in SEARCH_BASES:
            candidate = base / f"{requested}.onnx"
            if candidate.exists():
                return str(candidate), None
        return None, (
            f"voice '{requested}' is not downloaded yet -- run "
            f"'npm run voice:add-voice -- {requested}' and try again"
        )

    env_voice = os.environ.get("PIPER_VOICE", "").strip()
    if env_voice and Path(env_voice).exists():
        return env_voice, None
    if DEFAULT_VOICE_PATH.exists():
        return str(DEFAULT_VOICE_PATH), None
    for base in SEARCH_BASES:
        if not base.exists():
            continue
        matches = sorted(base.glob("es_ES*.onnx"))
        if matches:
            return str(matches[0]), None
    return None, (
        f"no Piper voice model; run 'npm run voice:ensure' to download {DEFAULT_VOICE_NAME}"
    )


def play_wav(path: Path) -> bool:
    for player in ("paplay", "aplay", "ffplay"):
        if shutil.which(player):
            args = (
                [player, str(path)]
                if player != "ffplay"
                else [player, "-nodisp", "-autoexit", str(path)]
            )
            subprocess.run(args, check=False, capture_output=True)
            return True
    return False


# Emoji / pictographs / regional-indicator flags -- espeak-ng either skips
# these silently (fine) or, for some codepoints, reads out a garbled
# description (not fine). Stripped before synthesis either way.
_EMOJI_RE = re.compile(
    "[" "\U0001f300-\U0001faff" "\U00002600-\U000027bf" "\U0001f1e6-\U0001f1ff" "]+",
    flags=re.UNICODE,
)


def normalize_for_speech(text: str) -> str:
    """Defense-in-depth text cleanup before handing text to Piper.

    The frontend already strips markdown; this is a safety net for any other
    caller so espeak-ng doesn't stumble over emoji, leftover markdown
    punctuation, or long runs of dots/exclamation marks.
    """
    cleaned = _EMOJI_RE.sub("", text)
    cleaned = re.sub(r"[*_~`#>]+", "", cleaned)
    cleaned = re.sub(r"\.{4,}", "...", cleaned)
    cleaned = re.sub(r"[!?]{2,}", lambda m: m.group(0)[0], cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return cleaned.strip()


def build_piper_command(
    piper_bin: str,
    model: str,
    out_path: str,
    *,
    length_scale: float | None = None,
    sentence_silence: float | None = None,
    noise_scale: float | None = None,
    noise_w: float | None = None,
) -> list[str]:
    """Pure command-builder kept separate from I/O so it's unit-testable
    without a real Piper binary (see `--selftest` below)."""
    cmd = [piper_bin, "-m", model, "-f", out_path]

    resolved_length_scale = DEFAULT_LENGTH_SCALE if length_scale is None else length_scale
    cmd += ["--length-scale", str(resolved_length_scale)]

    resolved_silence = DEFAULT_SENTENCE_SILENCE if sentence_silence is None else sentence_silence
    cmd += ["--sentence-silence", str(resolved_silence)]

    resolved_noise_scale = DEFAULT_NOISE_SCALE if noise_scale is None else noise_scale
    if resolved_noise_scale is not None:
        cmd += ["--noise-scale", str(resolved_noise_scale)]

    resolved_noise_w = DEFAULT_NOISE_W if noise_w is None else noise_w
    if resolved_noise_w is not None:
        cmd += ["--noise-w", str(resolved_noise_w)]

    return cmd


def speak(
    text: str,
    voice: str | None = None,
    length_scale: float | None = None,
    sentence_silence: float | None = None,
    noise_scale: float | None = None,
    noise_w: float | None = None,
) -> None:
    cleaned = normalize_for_speech((text or "").strip())
    if not cleaned:
        emit({"type": "tts-done", "ok": True, "skipped": True})
        return

    piper = find_piper()
    if not piper:
        emit({"type": "tts-error", "error": "piper binary not found; run pnpm voice:ensure"})
        return

    model, resolve_err = resolve_voice_path(voice)
    if not model:
        emit({"type": "tts-error", "error": resolve_err})
        return

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out_path = Path(tmp.name)

    cmd = build_piper_command(
        piper,
        model,
        str(out_path),
        length_scale=length_scale,
        sentence_silence=sentence_silence,
        noise_scale=noise_scale,
        noise_w=noise_w,
    )

    try:
        proc = subprocess.run(
            cmd,
            input=cleaned.encode("utf-8"),
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="replace").strip()
            emit({"type": "tts-error", "error": err or "piper failed"})
            return

        if not out_path.exists() or out_path.stat().st_size < 44:
            emit({"type": "tts-error", "error": "piper produced empty audio"})
            return

        if not play_wav(out_path):
            emit(
                {
                    "type": "tts-error",
                    "error": "no audio player (install alsa-utils or pulseaudio-utils)",
                }
            )
            return

        data = out_path.read_bytes()
        emit(
            {
                "type": "tts-chunk",
                "format": "wav",
                "bytes_b64": __import__("base64").b64encode(data).decode("ascii"),
            }
        )
        emit({"type": "tts-done", "ok": True})
    finally:
        try:
            out_path.unlink(missing_ok=True)
        except OSError:
            pass


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        _selftest()
        return

    emit({"status": "tts-ready"})
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        if raw.upper() == "EXIT":
            break
        if raw.upper().startswith("SPEAK "):
            try:
                payload = json.loads(raw[6:])
            except json.JSONDecodeError:
                emit({"type": "tts-error", "error": "invalid SPEAK json"})
                continue
            speak(
                str(payload.get("text", "")),
                payload.get("voice"),
                payload.get("length_scale"),
                payload.get("sentence_silence"),
                payload.get("noise_scale"),
                payload.get("noise_w"),
            )


def _selftest() -> None:
    """Assert-based self-check for the pure helpers -- no Piper binary or
    voice model required. Run with: python tts_engine.py --selftest"""

    cmd = build_piper_command("piper", "model.onnx", "/tmp/out.wav")
    assert cmd[:4] == ["piper", "-m", "model.onnx", "-f"], cmd
    assert "/tmp/out.wav" in cmd, cmd
    assert "--length-scale" in cmd and "1.0" in cmd, cmd
    assert "--sentence-silence" in cmd and "0.45" in cmd, cmd
    assert "--noise-scale" not in cmd, "noise-scale must stay unset by default"

    tuned = build_piper_command(
        "piper", "m.onnx", "o.wav", length_scale=1.15, sentence_silence=0.3, noise_scale=0.7
    )
    assert "1.15" in tuned and "0.3" in tuned and "0.7" in tuned, tuned

    assert "🚀" not in normalize_for_speech("Hola 🚀 mundo")
    assert normalize_for_speech("**bold** `code` #head") == "bold code head"
    assert normalize_for_speech("wait......") == "wait..."
    assert normalize_for_speech("wow!!!¿que??") == "wow!¿que?"

    path, err = resolve_voice_path("definitely-not-a-real-voice-xyz")
    assert path is None and "voice:add-voice" in err, (path, err)

    print("tts_engine selftest OK")


if __name__ == "__main__":
    main()
