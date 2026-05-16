import json
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_SHIM_TOKEN", "secret")
    monkeypatch.setenv("HERMES_SESSIONS_DIR", str(tmp_path))
    from hermes_shim.server import app
    return TestClient(app)


@pytest.fixture
def sessions_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_SHIM_TOKEN", "secret")
    monkeypatch.setenv("HERMES_SESSIONS_DIR", str(tmp_path))
    return tmp_path


def _write_session(dirpath, session_id, messages, started="2026-05-16T10:00:00",
                   updated="2026-05-16T10:05:00", model="gpt-5.5", system_prompt="be terse"):
    path = os.path.join(str(dirpath), f"session_{session_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({
            "session_id": session_id,
            "model": model,
            "session_start": started,
            "last_updated": updated,
            "system_prompt": system_prompt,
            "messages": messages,
        }, f)
    return path


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


def test_sessions_list_empty_when_no_files(client):
    r = client.get("/v1/sessions", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    assert r.json() == []


def test_sessions_list_reads_native_files(sessions_dir, monkeypatch):
    monkeypatch.setenv("HERMES_SHIM_TOKEN", "secret")
    _write_session(sessions_dir, "20260516_104201_5d5639", [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hey"},
    ])
    _write_session(sessions_dir, "20260516_134825_edfc95", [
        {"role": "user", "content": "P locked"},
    ], started="2026-05-16T13:48:25", updated="2026-05-16T13:50:00")

    from hermes_shim.server import app
    c = TestClient(app)
    r = c.get("/v1/sessions", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    # newest first
    assert rows[0]["id"] == "20260516_134825_edfc95"
    assert rows[0]["messageCount"] == 1
    assert rows[0]["model"] == "gpt-5.5"
    assert isinstance(rows[0]["lastActivityAt"], int)
    assert rows[1]["id"] == "20260516_104201_5d5639"
    assert rows[1]["messageCount"] == 2


def test_session_detail_404_when_missing(client):
    r = client.get("/v1/sessions/nope", headers={"authorization": "Bearer secret"})
    assert r.status_code == 404


def test_session_detail_returns_messages(sessions_dir):
    _write_session(sessions_dir, "abc123", [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": [{"type": "text", "text": "world"}]},
    ])
    from hermes_shim.server import app
    c = TestClient(app)
    r = c.get("/v1/sessions/abc123", headers={"authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["id"] == "abc123"
    assert body["summary"]["messageCount"] == 2
    assert body["systemPrompt"] == "be terse"
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][0]["text"] == "hello"
    assert body["messages"][1]["role"] == "assistant"
    assert body["messages"][1]["text"] == "world"


def test_session_detail_rejects_traversal(client):
    r = client.get("/v1/sessions/..%2Fetc", headers={"authorization": "Bearer secret"})
    # FastAPI decodes path param; ensure either 400 or 404, never a 200.
    assert r.status_code in (400, 404)


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


def test_chat_requires_bearer(client):
    r = client.post("/v1/chat", json={"session_id": "s1", "message": "hi"})
    assert r.status_code == 401


def test_chat_rejects_missing_session_id(client):
    r = client.post("/v1/chat", json={"message": "hi"}, headers={"authorization": "Bearer secret"})
    assert r.status_code == 400


def test_chat_rejects_missing_message(client):
    r = client.post("/v1/chat", json={"session_id": "s1"}, headers={"authorization": "Bearer secret"})
    assert r.status_code == 400


def test_chat_returns_assistant_text(client, monkeypatch):
    class FakeCompleted:
        returncode = 0
        stdout = "pong\n"
        stderr = ""

    def fake_run(args, **kwargs):
        assert "-z" in args
        assert "hi" in args
        assert "--continue" in args
        assert "copilot-s1" in args
        return FakeCompleted()

    monkeypatch.setattr("hermes_shim.server.subprocess.run", fake_run)
    r = client.post(
        "/v1/chat",
        json={"session_id": "copilot-s1", "message": "hi"},
        headers={"authorization": "Bearer secret"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["assistant_text"] == "pong"
    assert body["session_id"] == "copilot-s1"


def test_chat_502_on_empty_output(client, monkeypatch):
    class FakeCompleted:
        returncode = 0
        stdout = ""
        stderr = ""

    monkeypatch.setattr("hermes_shim.server.subprocess.run", lambda *a, **k: FakeCompleted())
    r = client.post(
        "/v1/chat",
        json={"session_id": "s1", "message": "hi"},
        headers={"authorization": "Bearer secret"},
    )
    assert r.status_code == 502


def test_chat_502_on_nonzero_returncode(client, monkeypatch):
    class FakeCompleted:
        returncode = 1
        stdout = ""
        stderr = "auth expired"

    monkeypatch.setattr("hermes_shim.server.subprocess.run", lambda *a, **k: FakeCompleted())
    r = client.post(
        "/v1/chat",
        json={"session_id": "s1", "message": "hi"},
        headers={"authorization": "Bearer secret"},
    )
    assert r.status_code == 502


def test_capabilities_includes_sessions_send(client):
    r = client.get("/v1/capabilities", headers={"authorization": "Bearer secret"})
    body = r.json()
    assert "sessions.send" in body["supported"]
