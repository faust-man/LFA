from unittest.mock import MagicMock

VALID_PASSWORD = "Password123"  # 11 символов, буквы + цифры — проходит validate_password_strength


def test_register_rejects_unsafe_username_chars(client):
    resp = client.post("/api/auth/register", json={
        "username": "bad name!", "email": "a@example.com", "password": VALID_PASSWORD,
    })
    assert resp.status_code == 400
    assert "буквы" in resp.get_json()["error"] or "символ" in resp.get_json()["error"]


def test_register_rejects_short_password(client):
    resp = client.post("/api/auth/register", json={
        "username": "gooduser", "email": "a@example.com", "password": "short1",
    })
    assert resp.status_code == 400


def test_register_rejects_too_long_password(client):
    resp = client.post("/api/auth/register", json={
        "username": "gooduser", "email": "a@example.com", "password": "A1" + "x" * 200,
    })
    assert resp.status_code == 400


def test_register_rejects_duplicate_user(client, mock_db):
    mock_db["fetch_one"].return_value = {"id": 1}  # уже существует
    resp = client.post("/api/auth/register", json={
        "username": "gooduser", "email": "a@example.com", "password": VALID_PASSWORD,
    })
    assert resp.status_code == 409


def test_register_success(client, mock_db):
    mock_db["fetch_one"].return_value = None
    mock_db["execute_returning"].return_value = {
        "id": 1, "username": "gooduser", "email": "a@example.com", "created_at": "2026-01-01T00:00:00Z",
    }
    resp = client.post("/api/auth/register", json={
        "username": "gooduser", "email": "a@example.com", "password": VALID_PASSWORD,
    })
    assert resp.status_code == 201
    assert resp.get_json()["username"] == "gooduser"


def test_login_unknown_email_still_checks_dummy_hash(client, mock_db, monkeypatch):
    """Защита от timing-атаки: даже когда пользователь не найден, должна
    вызываться проверка хэша (против фиктивного хэша), а не короткий путь без
    неё — иначе по времени ответа можно было бы понять, существует ли email."""
    from backend import auth as auth_module

    mock_db["fetch_one"].return_value = None
    spy = MagicMock(wraps=auth_module.verify_password)
    monkeypatch.setattr(auth_module, "verify_password", spy)

    resp = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})

    assert resp.status_code == 401
    spy.assert_called_once()
    assert spy.call_args[0][1] == auth_module.DUMMY_PASSWORD_HASH


def test_login_locked_account(client, mock_db):
    from datetime import datetime, timedelta, timezone

    mock_db["fetch_one"].return_value = {
        "id": 1, "is_active": True, "password_hash": "x",
        "locked_until": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    resp = client.post("/api/auth/login", json={"email": "a@example.com", "password": "wrong"})
    assert resp.status_code == 423


def test_login_wrong_password_registers_failed_attempt(client, mock_db):
    from backend import auth as auth_module

    mock_db["fetch_one"].return_value = {
        "id": 1, "is_active": True,
        "password_hash": auth_module.hash_password("SomeOtherPassword1"),
        "locked_until": None,
    }
    resp = client.post("/api/auth/login", json={"email": "a@example.com", "password": "wrong-password"})
    assert resp.status_code == 401
    # execute() был вызван для register_failed_login и log_audit
    assert mock_db["execute"].called


def test_login_success_returns_tokens(client, mock_db):
    from backend import auth as auth_module

    mock_db["fetch_one"].return_value = {
        "id": 1, "username": "gooduser", "email": "a@example.com",
        "is_active": True, "password_hash": auth_module.hash_password(VALID_PASSWORD),
        "locked_until": None,
    }
    resp = client.post("/api/auth/login", json={"email": "a@example.com", "password": VALID_PASSWORD})
    assert resp.status_code == 200
    body = resp.get_json()
    assert "access_token" in body and "refresh_token" in body


def test_logout_revokes_token_immediately(client, app, mock_db, auth_headers):
    """После logout тот же access-токен больше не должен приниматься
    защищёнными роутами — до истечения своего срока действия."""
    headers = auth_headers(1)
    mock_db["fetch_all"].return_value = []

    logout_resp = client.post("/api/auth/logout", headers=headers)
    assert logout_resp.status_code == 200

    reused_resp = client.get("/api/chats", headers=headers)
    assert reused_resp.status_code == 401
