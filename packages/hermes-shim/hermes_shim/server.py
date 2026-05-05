"""FastAPI app for the Hermes shim.

Phase A1 entity endpoints (sessions/skills/activity) remain stubbed (return []
and 404) until they are reimplemented against native sources
(~/.hermes/sessions/*.json, hermes sessions export, state.db, ~/.hermes/logs).

Phase A2 added /v1/chat: dispatches a single user turn through `hermes -z`
in oneshot mode with a stable session id (`--continue <session_id>`) so
Hermes maintains conversation memory across turns. Default model + provider
are configurable via env (HERMES_MODEL / HERMES_PROVIDER); falls back to
gpt-5.5 + openai-codex (verified working on 2026-05-06).
"""
import os
import shutil
import subprocess
import time
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request

SHIM_VERSION = "0.2.0"

app = FastAPI(title="OpenClaw Hermes Shim", version=SHIM_VERSION)


def require_bearer(request: Request) -> None:
    expected = os.environ.get("HERMES_SHIM_TOKEN")
    if not expected:
        raise HTTPException(status_code=500, detail="HERMES_SHIM_TOKEN not configured")
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


def hermes_bin() -> str:
    return shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes")


def hermes_version() -> str:
    try:
        out = subprocess.run(
            [hermes_bin(), "--version"], capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


@app.get("/v1/health")
def health(_: None = Depends(require_bearer)) -> dict[str, Any]:
    return {"ok": True, "hermes_version": hermes_version()}


@app.get("/v1/version")
def version(_: None = Depends(require_bearer)) -> dict[str, str]:
    return {"shim": SHIM_VERSION, "hermes": hermes_version()}


@app.get("/v1/capabilities")
def capabilities(_: None = Depends(require_bearer)) -> dict[str, Any]:
    return {
        "supported": ["sessions.list", "sessions.read", "skills.list", "sessions.send"],
        "partial": [
            {
                "id": "logs.tail",
                "reason": "lines-only projection of /v1/activity",
                "projectionMode": "inferred",
                "lossiness": "lossy",
            }
        ],
        "unsupported": [
            "channels.list", "channels.status",
            "memory.query", "memory.write", "skills.install",
            "tools.list", "tools.invoke", "cron.list", "cron.write",
            "config.get", "config.set", "agents.list", "agents.read",
        ],
    }


# Phase-1 stubs.
@app.get("/v1/sessions")
def sessions_list(_: None = Depends(require_bearer)) -> list[Any]:
    return []


@app.get("/v1/sessions/{session_id}")
def session_detail(session_id: str, _: None = Depends(require_bearer)) -> dict[str, Any]:
    raise HTTPException(status_code=404, detail="session not found (Phase-1 stub)")


@app.get("/v1/skills")
def skills_list(_: None = Depends(require_bearer)) -> list[Any]:
    return []


@app.get("/v1/activity")
def activity(since: int | None = None, limit: int | None = None,
             _: None = Depends(require_bearer)) -> list[Any]:
    return []


# Phase A2: chat. Synchronous; bridge holds an HTTP request open for up to
# HERMES_CHAT_TIMEOUT_S seconds while `hermes -z` runs.
def _hermes_chat_args(session_id: str, message: str) -> list[str]:
    model = os.environ.get("HERMES_MODEL", "gpt-5.5")
    provider = os.environ.get("HERMES_PROVIDER", "openai-codex")
    args = [
        hermes_bin(),
        "-z", message,
        "--model", model,
        "--provider", provider,
        "--continue", session_id,
        "--ignore-rules",
    ]
    return args


@app.post("/v1/chat")
def chat(payload: dict[str, Any], _: None = Depends(require_bearer)) -> dict[str, Any]:
    session_id = payload.get("session_id")
    message = payload.get("message")
    if not isinstance(session_id, str) or not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    if not isinstance(message, str) or not message:
        raise HTTPException(status_code=400, detail="message required")

    timeout_s = int(os.environ.get("HERMES_CHAT_TIMEOUT_S", "180"))

    started = time.time()
    try:
        out = subprocess.run(
            _hermes_chat_args(session_id, message),
            capture_output=True, text=True, timeout=timeout_s,
            env={**os.environ, "HERMES_YOLO_MODE": "1"},
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"hermes chat exceeded {timeout_s}s")

    elapsed_ms = int((time.time() - started) * 1000)
    if out.returncode != 0:
        detail = (out.stderr.strip() or out.stdout.strip())[:500]
        raise HTTPException(status_code=502, detail=f"hermes returned {out.returncode}: {detail}")

    text = out.stdout.strip()
    if not text:
        # Hermes silently produces empty output when model/provider config is mismatched.
        raise HTTPException(
            status_code=502,
            detail="hermes returned empty output (check model/provider config; default gpt-5.5 + openai-codex)",
        )

    return {"ok": True, "assistant_text": text, "session_id": session_id, "elapsed_ms": elapsed_ms}
