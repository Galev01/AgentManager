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


def test_sessions_list_requires_auth(client):
    r = client.get("/v1/sessions")
    assert r.status_code == 401


def test_sessions_list_returns_array(client, monkeypatch):
    monkeypatch.setattr(
        "hermes_shim.server._run_hermes_json",
        lambda args: [{"id": "s1", "name": "demo", "lastActivityAt": 0}],
    )
    r = client.get("/v1/sessions", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert body[0]["id"] == "s1"


def test_session_detail_returns_object(client, monkeypatch):
    monkeypatch.setattr(
        "hermes_shim.server._run_hermes_json",
        lambda args: {"id": "s1", "transcript": [{"role": "user", "text": "hi"}]},
    )
    r = client.get("/v1/sessions/s1", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "s1"
    assert body["transcript"][0]["text"] == "hi"


def test_skills_list(client, monkeypatch):
    monkeypatch.setattr(
        "hermes_shim.server._run_hermes_json",
        lambda args: [{"id": "skill1", "name": "ping", "version": "1.0"}],
    )
    r = client.get("/v1/skills", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json()[0]["id"] == "skill1"


def test_activity_query_params(client, monkeypatch):
    captured = {}
    def fake(args):
        captured["args"] = args
        return [{"kind": "message_in", "at": 1, "text": "hello"}]
    monkeypatch.setattr("hermes_shim.server._run_hermes_json", fake)
    r = client.get("/v1/activity?since=100&limit=5", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert "100" in captured["args"]
    assert "5" in captured["args"]
