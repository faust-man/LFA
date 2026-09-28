"""
Общие фикстуры для тестов backend'а.

Тесты НЕ поднимают настоящий PostgreSQL/Redis: слой backend.db подменяется
моками (см. фикстуру mock_db), а backend.security работает в резервном
in-memory режиме (без Redis) — этого достаточно, чтобы проверить бизнес-логику
и валидацию в роутах, не поднимая инфраструктуру.

Запуск: pip install -r requirements.txt -r requirements-dev.txt && pytest
"""
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Обязательные переменные окружения (см. backend/config.py) — значения для
# тестов, никогда не используются в реальном окружении.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test_db")
os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret-key")


@pytest.fixture
def app(monkeypatch):
    """Создаёт новое Flask-приложение на тест, с подменённым db.init_pool
    (чтобы не пытаться реально коннектиться к Postgres) и очищенным
    in-memory чёрным списком JWT (см. backend/security.py)."""
    from backend import db as db_module
    from backend import security as security_module

    monkeypatch.setattr(db_module, "init_pool", lambda *_a, **_kw: None)
    security_module._local_blocklist.clear()
    security_module._redis_client = None  # тесты работают без Redis

    from backend.app import create_app
    application = create_app({
        "TESTING": True,
        # DEBUG=True -> Talisman не форсирует HTTPS и не требует Secure-cookie —
        # иначе тестовый клиент (обычный http) получал бы 302 на каждый запрос.
        "DEBUG": True,
        # Иначе лимиты по IP накапливались бы через весь тестовый прогон
        # (Limiter — процесс-глобальный синглтон, а тестовый клиент всегда
        # шлёт запросы с одного и того же адреса).
        "RATELIMIT_ENABLED": False,
        # По умолчанию LOCAL_UPLOAD_DIR указывает на /app/uploads (путь
        # внутри Docker-контейнера) — в тестовом окружении его может не
        # быть/не быть прав на запись, поэтому подменяем на временную папку.
        "LOCAL_UPLOAD_DIR": tempfile.mkdtemp(prefix="photo_uploads_test_"),
    })
    return application


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def mock_db(monkeypatch):
    """Подменяет backend.db.fetch_one/fetch_all/execute/execute_returning
    моками, которые каждый тест настраивает под себя через
    .return_value / .side_effect."""
    from backend import db as db_module

    mocks = {
        "fetch_one": MagicMock(return_value=None),
        "fetch_all": MagicMock(return_value=[]),
        "execute": MagicMock(return_value=None),
        "execute_returning": MagicMock(return_value=None),
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(db_module, name, mock)
    return mocks


@pytest.fixture
def auth_headers(app):
    """Фабрика заголовков Authorization с валidным access-токеном для
    заданного user_id — использование: `auth_headers()` или `auth_headers(7)`."""
    from flask_jwt_extended import create_access_token

    def _make(user_id: int = 1) -> dict:
        with app.app_context():
            token = create_access_token(identity=str(user_id))
        return {"Authorization": f"Bearer {token}"}

    return _make
