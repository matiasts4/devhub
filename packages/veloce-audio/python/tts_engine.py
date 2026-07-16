#!/usr/bin/env python3
"""Minimal Piper TTS sidecar for DevHub Zed voice replies."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
VOICES_DIR = SCRIPT_DIR / "voices"
DEFAULT_VOICE_PATH = VOICES_DIR / "es_ES-davefx-medium.onnx"


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


def resolve_voice_model(voice_id: str | None = None) -> str | None:
    if voice_id:
        candidate = Path(voice_id)
        if candidate.exists():
            return str(candidate)
        voice_path = VOICES_DIR / f"{voice_id}.onnx"
        if voice_path.exists():
            return str(voice_path)
    env_voice = os.environ.get("PIPER_VOICE", "").strip()
    if env_voice and Path(env_voice).exists():
        return env_voice
    if DEFAULT_VOICE_PATH.exists():
        return str(DEFAULT_VOICE_PATH)
    for base in (
        VOICES_DIR,
        Path.home() / ".local/share/piper/voices",
        Path("/usr/share/piper/voices"),
    ):
        if not base.exists():
            continue
        matches = sorted(base.glob("es_ES*.onnx"))
        if matches:
            return str(matches[0])
    return None


def play_wav(path: Path) -> bool:
    for player in ("paplay", "aplay", "ffplay"):
        if shutil.which(player):
            args = [player, str(path)] if player != "ffplay" else [player, "-nodisp", "-autoexit", str(path)]
            subprocess.run(args, check=False, capture_output=True)
            return True
    return False


def speak(text: str, voice: str | None = None, length_scale: float | None = None) -> None:
    cleaned = (text or "").strip()
    if not cleaned:
        emit({"type": "tts-done", "ok": True, "skipped": True})
        return

    piper = find_piper()
    if not piper:
        emit({"type": "tts-error", "error": "piper binary not found; run pnpm voice:ensure"})
        return

    model = resolve_voice_model(voice)
    if not model:
        emit(
            {
                "type": "tts-error",
                "error": "no Piper voice model; run pnpm voice:ensure to download es_ES-davefx-medium",
            }
        )
        return

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out_path = Path(tmp.name)

    cmd = [piper, "-m", model, "-f", str(out_path)]
    if length_scale is not None:
        cmd.extend(["--length-scale", str(length_scale)])

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
            options = payload.get("options") or {}
            speak(
                str(payload.get("text", "")),
                voice=options.get("voice") or payload.get("voice"),
                length_scale=options.get("length_scale"),
            )


if __name__ == "__main__":
    main()
