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
