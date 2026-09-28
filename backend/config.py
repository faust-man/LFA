import os
from datetime import timedelta


def _require_env(name: str) -> str:
    """Строгое требование переменной окружения — без значений по умолчанию
    для секретов, чтобы случайно не запустить прод с дефолтным паролем."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Не задана обязательная переменная окружения: {name}")
    return value


class Config:
    # --- База данных ---
    DATABASE_URL = _require_env("DATABASE_URL")

    # --- Секреты ---
    JWT_SECRET_KEY = _require_env("JWT_SECRET_KEY")

    # --- JWT ---
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_BLOCKLIST_ENABLED = True
    JWT_BLOCKLIST_TOKEN_CHECKS = ["access", "refresh"]

    # --- CORS: явный список разрешённых доменов фронтенда ---
    CORS_ORIGINS = [
        o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
    ]

    # --- Rate limiting (хранилище лимитов — Redis в проде) ---
    RATE_LIMIT_STORAGE_URL = os.environ.get("RATE_LIMIT_STORAGE_URL", "memory://")

    # --- Redis для чёрного списка отозванных JWT (logout). Без него (например,
    # в локальной разработке) используется резервный in-memory список в security.py. ---
    REDIS_URL = os.environ.get("REDIS_URL")

    # --- Политика блокировки аккаунта ---
    MAX_FAILED_LOGIN_ATTEMPTS = 5
    ACCOUNT_LOCK_MINUTES = 15

    # --- Требования к паролю ---
    PASSWORD_MIN_LENGTH = 10
    PASSWORD_MAX_LENGTH = 128

    # --- Хранение фотографий (см. backend/media.py, backend/storage.py) ---
    # local — диск backend-контейнера (Docker-том), s3 — S3-совместимое
    # облако (AWS S3, Yandex Object Storage, Selectel и т.д.).
    STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local")

    LOCAL_UPLOAD_DIR = os.environ.get("LOCAL_UPLOAD_DIR", "/app/uploads")
    # Публичный адрес, под которым backend раздаёт файлы из LOCAL_UPLOAD_DIR
    # (см. GET /media/<path> в app.py) — например, https://my-site.com/media
    PUBLIC_MEDIA_BASE_URL = os.environ.get("PUBLIC_MEDIA_BASE_URL", "http://localhost:5000/media")

    S3_BUCKET = os.environ.get("S3_BUCKET", "")
    S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "")  # пусто -> реальный AWS S3
    S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
    S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")
    S3_REGION = os.environ.get("S3_REGION", "ru-central1")
    S3_PUBLIC_BASE_URL = os.environ.get("S3_PUBLIC_BASE_URL", "")  # например, CDN-домен или URL бакета

    # Жёсткий предел Flask на тело запроса — защита от заливки гигантских
    # файлов в память процесса ещё до того, как до них дойдёт backend.media.
    # Чуть больше MAX_UPLOAD_BYTES из media.py, чтобы multipart-обвязка
    # формы не срезала валидный файл впритык к границе.
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 МБ

    # --- Флаг окружения ---
    ENV = os.environ.get("FLASK_ENV", "production")
    DEBUG = ENV == "development"
