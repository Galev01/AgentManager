"""FastAPI app for the Hermes shim. Endpoints are wired in C2-C4."""
from fastapi import FastAPI

SHIM_VERSION = "0.1.0"

app = FastAPI(title="OpenClaw Hermes Shim", version=SHIM_VERSION)
