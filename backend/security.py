"""
Прикладной уровень защиты (Secure Coding). Периметровые меры —
WAF, anti-DDoS, anti-bot — вынесены на уровень reverse-proxy/инфраструктуры
(см. nginx/ и README.md), т.к. на уровне Flask-кода их эмулировать бессмысленно.
"""
import bleach
import re
import redis as redis_lib
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman

limiter = Limiter(key_func=get_remote_address, default_limits=["200 per hour"])

_redis_client = None
# Резервный чёрный список токенов на случай локальной разработки без Redis.
# В проде (docker-compose) REDIS_URL всегда задан, поэтому используется Redis.
_local_blocklist: set[str] = set()


def init_security(app):
    # --- HTTPS-only, безопасные заголовки (аналог части WAF-логики) ---
    Talisman(
        app,
        force_https=not app.config["DEBUG"],
        strict_transport_security=True,
        content_security_policy={
            "default-src": "'self'",
            "img-src": ["'self'", "data:"],
        },
        session_cookie_secure=not app.config["DEBUG"],
    )

    # --- CORS: только явно разрешённые домены фронтенда, не "*" ---
    CORS(
        app,
        origins=app.config["CORS_ORIGINS"] or [],
        supports_credentials=True,
    )

    # --- Rate limiting / базовая защита от брутфорса и DDoS на уровне приложения ---
    limiter.init_app(app)
    app.config["RATELIMIT_STORAGE_URI"] = app.config["RATE_LIMIT_STORAGE_URL"]

    # --- Чёрный список отозванных JWT (logout) ---
    global _redis_client
    redis_url = app.config.get("REDIS_URL")
    if redis_url:
        _redis_client = redis_lib.from_url(redis_url)

    return app


def revoke_token(jti: str, expires_in_seconds: int) -> None:
    """Помечает JWT как отозванный (logout) — токен перестаёт приниматься
    сразу, а не по истечении своего срока. Запись живёт ровно до истечения
    токена (TTL), поэтому список не растёт бесконечно."""
    ttl = max(int(expires_in_seconds), 1)
    if _redis_client:
        _redis_client.setex(f"revoked_jwt:{jti}", ttl, "1")
    else:
        _local_blocklist.add(jti)


def is_token_revoked(jti: str) -> bool:
    if _redis_client:
        return _redis_client.exists(f"revoked_jwt:{jti}") == 1
    return jti in _local_blocklist


def sanitize_text(value: str | None, max_length: int = 2000) -> str | None:
    """Экранирует HTML/JS перед сохранением текста от пользователя —
    защита от XSS и хранимых инъекций в чатах/описаниях объявлений."""
    if value is None:
        return None
    cleaned = bleach.clean(value, tags=[], attributes={}, strip=True).strip()
    return cleaned[:max_length]


def validate_url(value: str | None, max_length: int = 500) -> str | None:
    """Возвращает очищенный URL или None, если поле не заполнено.
    Разрешены только http(s) — это защищает фронтенд от javascript:/data:
    и подобных URI-схем, которые могли бы выполниться при рендеринге
    ссылки или картинки (photo_url, map_link)."""
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    if len(value) > max_length or not re.match(r"^https?://", value, re.IGNORECASE):
        raise ValueError("Ссылка должна начинаться с http:// или https://")
    return value
