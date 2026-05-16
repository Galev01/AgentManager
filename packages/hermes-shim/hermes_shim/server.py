"""FastAPI app for the Hermes shim.

Phase A3 implements /v1/sessions (list) and /v1/sessions/{id} (detail)
against the native Hermes session store at ~/.hermes/sessions/session_*.json.
Skills and activity remain stubbed.

Phase A2 added /v1/chat: dispatches a single user turn through `hermes -z`
in oneshot mode with a stable session id (`--continue <session_id>`) so
Hermes maintains conversation memory across turns. Default model + provider
are configurable via env (HERMES_MODEL / HERMES_PROVIDER); falls back to
gpt-5.5 + openai-codex (verified working on 2026-05-06).
"""
import glob
import json
import os
import shutil
import subprocess
import time
from datetime import datetime
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


def _sessions_dir() -> str:
    return os.environ.get(
        "HERMES_SESSIONS_DIR",
        os.path.expanduser("~/.hermes/sessions"),
    )


def _iso_to_epoch_ms(value: Any) -> int | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        # Hermes writes naive ISO timestamps in local time.
        dt = datetime.fromisoformat(value)
        return int(dt.timestamp() * 1000)
    except ValueError:
        return None


def _list_session_files() -> list[str]:
    pattern = os.path.join(_sessions_dir(), "session_*.json")
    return sorted(glob.glob(pattern))


def _project_session_summary(path: str) -> dict[str, Any] | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    session_id = data.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        # Fall back to filename stem.
        base = os.path.basename(path)
        session_id = base[len("session_") : -len(".json")] if base.startswith("session_") else base

    messages = data.get("messages") if isinstance(data.get("messages"), list) else []
    started_at = _iso_to_epoch_ms(data.get("session_start"))
    last_activity_at = _iso_to_epoch_ms(data.get("last_updated")) or started_at

    return {
        "id": session_id,
        "displayName": session_id,
        "startedAt": started_at,
        "lastActivityAt": last_activity_at,
        "messageCount": len(messages),
        "model": data.get("model") if isinstance(data.get("model"), str) else None,
    }


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                # Common shapes: {type: "text", text: "..."} / {type: "input_text", text: "..."}
                txt = item.get("text") or item.get("content")
                if isinstance(txt, str):
                    parts.append(txt)
        return "\n".join(parts)
    if content is None:
        return ""
    return json.dumps(content, ensure_ascii=False)


def _normalize_role(role: Any) -> str:
    if isinstance(role, str) and role in ("user", "assistant", "system", "tool"):
        return role
    return "unknown"


@app.get("/v1/sessions")
def sessions_list(_: None = Depends(require_bearer)) -> list[Any]:
    out: list[dict[str, Any]] = []
    for path in _list_session_files():
        summary = _project_session_summary(path)
        if summary is not None:
            out.append(summary)
    # Most recent first.
    out.sort(key=lambda s: s.get("lastActivityAt") or 0, reverse=True)
    return out


@app.get("/v1/sessions/{session_id}")
def session_detail(session_id: str, _: None = Depends(require_bearer)) -> dict[str, Any]:
    # session_id may include directory traversal characters — guard.
    if "/" in session_id or "\\" in session_id or ".." in session_id:
        raise HTTPException(status_code=400, detail="invalid session_id")
    # Hermes file naming: session_<id>.json. The chat() endpoint accepts an
    # arbitrary client-supplied session_id, but the native file is named after
    # whatever the CLI wrote — so try both the bare id and the session_ prefix.
    candidates = [
        os.path.join(_sessions_dir(), f"session_{session_id}.json"),
        os.path.join(_sessions_dir(), f"{session_id}.json"),
    ]
    path = next((p for p in candidates if os.path.exists(p)), None)
    if path is None:
        raise HTTPException(status_code=404, detail="session not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=500, detail=f"failed to read session: {e}")

    raw_messages = data.get("messages") if isinstance(data.get("messages"), list) else []
    messages: list[dict[str, Any]] = []
    for idx, m in enumerate(raw_messages):
        if not isinstance(m, dict):
            continue
        messages.append({
            "index": idx,
            "role": _normalize_role(m.get("role")),
            "text": _extract_text(m.get("content")),
            "contentType": "text",
        })

    summary = _project_session_summary(path) or {
        "id": session_id,
        "displayName": session_id,
        "startedAt": None,
        "lastActivityAt": None,
        "messageCount": len(messages),
        "model": data.get("model") if isinstance(data.get("model"), str) else None,
    }
    summary["messageCount"] = len(messages)

    system_prompt = data.get("system_prompt") if isinstance(data.get("system_prompt"), str) else None

    return {
        "summary": summary,
        "systemPrompt": system_prompt,
        "messages": messages,
    }


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
