import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("HERMES_SHIM_TOKEN", "secret")
    # late import so env is in place
    from hermes_shim.server import app
    return TestClient(app)


def test_health_requires_bearer(client):
    r = client.get("/v1/health")
    assert r.status_code == 401


def test_health_ok(client):
    r = client.get("/v1/health", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_version(client):
    r = client.get("/v1/version", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert "shim" in body
    assert "hermes" in body


def test_capabilities_shape(client):
    r = client.get("/v1/capabilities", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert "supported" in body
    assert "partial" in body
    assert "unsupported" in body
    assert "sessions.list" in body["supported"]
    assert any(p["id"] == "logs.tail" for p in body["partial"])
