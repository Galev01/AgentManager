import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("HERMES_SHIM_TOKEN", "secret")
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


def test_sessions_list_phase1_stub_returns_empty(client):
    r = client.get("/v1/sessions", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json() == []


def test_session_detail_phase1_stub_returns_404(client):
    r = client.get("/v1/sessions/anything", headers={"authorization": "Bearer secret"})
    assert r.status_code == 404


def test_skills_list_phase1_stub_returns_empty(client):
    r = client.get("/v1/skills", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json() == []


def test_activity_phase1_stub_returns_empty(client):
    r = client.get("/v1/activity", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json() == []


def test_activity_accepts_query_params(client):
    r = client.get("/v1/activity?since=100&limit=5", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json() == []
