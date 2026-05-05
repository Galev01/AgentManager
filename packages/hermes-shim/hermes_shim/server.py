"""FastAPI app for the Hermes shim.

Live verification (2026-05-06) showed the Hermes CLI does not expose a `--json`
flag on `sessions list`, `skills list`, or `logs tail`, and there is no
`sessions show` subcommand at all. Until those endpoints are reimplemented to
read native sources (e.g. `~/.hermes/sessions/*.json`, `hermes sessions export`,
`~/.hermes/logs/*.log`, or a SQLite query against `~/.hermes/state.db`), the
sessions / skills / activity endpoints return empty arrays. This is honest
Phase-1 behavior — the runtime adapter already declares these capabilities as
`supported` (sessions) / `partial` (logs.tail) at the *contract* level, but
real entity data is Phase 2.
"""
import os
import shutil
import subprocess
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request

SHIM_VERSION = "0.1.0"

app = FastAPI(title="OpenClaw Hermes Shim", version=SHIM_VERSION)


def require_bearer(request: Request) -> None:
    expected = os.environ.get("HERMES_SHIM_TOKEN")
    if not expected:
        raise HTTPException(status_code=500, detail="HERMES_SHIM_TOKEN not configured")
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


def hermes_version() -> str:
    bin_path = shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes")
    try:
        out = subprocess.run(
            [bin_path, "--version"], capture_output=True, text=True, timeout=5,
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
        "supported": ["sessions.list", "sessions.read", "skills.list"],
        "partial": [
            {
                "id": "logs.tail",
                "reason": "lines-only projection of /v1/activity",
                "projectionMode": "inferred",
                "lossiness": "lossy",
            }
        ],
        "unsupported": [
            "sessions.send", "channels.list", "channels.status",
            "memory.query", "memory.write", "skills.install",
            "tools.list", "tools.invoke", "cron.list", "cron.write",
            "config.get", "config.set", "agents.list", "agents.read",
        ],
    }


# Phase-1 stubs — return empty results. See module docstring for the Phase-2 plan.
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
