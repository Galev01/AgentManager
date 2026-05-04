import os
import sys
import uvicorn
from .server import app


def main() -> int:
    bind_lan = os.environ.get("HERMES_SHIM_BIND_LAN") == "1"
    host = os.environ.get("HERMES_SHIM_HOST", "127.0.0.1")
    port = int(os.environ.get("HERMES_SHIM_PORT", "9119"))
    if host != "127.0.0.1" and not bind_lan:
        print(
            f"refusing to bind {host}:{port} without HERMES_SHIM_BIND_LAN=1",
            file=sys.stderr,
        )
        return 2
    if not os.environ.get("HERMES_SHIM_TOKEN"):
        print("HERMES_SHIM_TOKEN required", file=sys.stderr)
        return 2
    uvicorn.run(app, host=host, port=port, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
