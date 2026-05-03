"""FastAPI app for the Hermes shim. Endpoints are wired in C2-C4."""
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


import json


# TODO(verify): exact `hermes` subcommand flags below are based on the spec/plan
# and have not been validated against the live `hermes --help` output. Before
# deploying, run `hermes sessions --help` / `hermes skills --help` / `hermes
# logs tail --help` on the remote host and adjust the arg lists if needed
# (e.g. `--json` may be `--format=json`, `--since` may be `--since-ms`, etc.).
def _hermes_bin() -> str:
    return shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes")


def _run_hermes_json(args: list[str]) -> Any:
    """Run hermes CLI and parse JSON stdout. Override in tests via monkeypatch."""
    out = subprocess.run(
        [_hermes_bin(), *args], capture_output=True, text=True, timeout=15,
    )
    if out.returncode != 0:
        raise HTTPException(status_code=502, detail=f"hermes CLI failed: {out.stderr.strip()[:300]}")
    try:
        return json.loads(out.stdout) if out.stdout.strip() else []
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"hermes CLI returned non-JSON: {e}")


@app.get("/v1/sessions")
def sessions_list(_: None = Depends(require_bearer)) -> Any:
    return _run_hermes_json(["sessions", "list", "--json"])


@app.get("/v1/sessions/{session_id}")
def session_detail(session_id: str, _: None = Depends(require_bearer)) -> Any:
    return _run_hermes_json(["sessions", "show", session_id, "--json"])
