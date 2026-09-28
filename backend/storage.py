"""
Абстракция хранилища фотографий: локальный диск (Docker-том) или
S3-совместимое облако (AWS S3, Yandex Object Storage, Selectel и т.д.).
Выбирается переменной окружения STORAGE_BACKEND=local|s3 (см. config.py).

В БД (таблица photos) сохраняется только: публичный URL, ключ файла в
хранилище и метаданные (размер, вес) — сами байты фото в БД не хранятся,
как и рекомендовано в ТЗ.
"""
from __future__ import annotations

import os
import uuid
from abc import ABC, abstractmethod


class Storage(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes, content_type: str) -> str:
        """Сохраняет файл, возвращает публичный URL для записи в БД."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Удаляет файл. Не должен бросать исключение, если файла уже нет."""


class LocalStorage(Storage):
    """Хранение на диске backend-контейнера (Docker-том photo_uploads —
    см. docker-compose.yml). Раздаётся через GET /media/<путь> (backend.app)."""

    def __init__(self, base_dir: str, public_base_url: str):
        self.base_dir = os.path.abspath(base_dir)
        self.public_base_url = public_base_url.rstrip("/")
        os.makedirs(self.base_dir, exist_ok=True)

    def _safe_path(self, key: str) -> str:
        # Ключи мы всегда генерируем сами (см. new_photo_key) в виде
        # "listings/<id>/<uuid>_<variant>.webp", но на всякий случай не
        # доверяем им вслепую — защита от path traversal (../../etc/passwd).
        path = os.path.abspath(os.path.join(self.base_dir, key))
        if not path.startswith(self.base_dir + os.sep):
            raise ValueError("Некорректный ключ файла")
        return path

    def save(self, key: str, data: bytes, content_type: str) -> str:
        path = self._safe_path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        return f"{self.public_base_url}/{key}"

    def delete(self, key: str) -> None:
        try:
            path = self._safe_path(key)
        except ValueError:
            return
        if os.path.exists(path):
            os.remove(path)


class S3Storage(Storage):
    """S3-совместимое облако. endpoint_url пустой/None — реальный AWS S3;
    для Yandex Cloud/Selectel/др. указывается их S3-эндпоинт."""

    def __init__(self, bucket: str, endpoint_url: str | None, access_key: str,
                 secret_key: str, region: str, public_base_url: str):
        import boto3  # импорт лениво: не всем инсталляциям нужен boto3
        self.bucket = bucket
        self.public_base_url = public_base_url.rstrip("/")
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    def save(self, key: str, data: bytes, content_type: str) -> str:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
        return f"{self.public_base_url}/{key}"

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


_storage: Storage | None = None


def init_storage(app) -> None:
    global _storage
    backend = app.config["STORAGE_BACKEND"]
    if backend == "s3":
        _storage = S3Storage(
            bucket=app.config["S3_BUCKET"],
            endpoint_url=app.config["S3_ENDPOINT_URL"],
            access_key=app.config["S3_ACCESS_KEY_ID"],
            secret_key=app.config["S3_SECRET_ACCESS_KEY"],
            region=app.config["S3_REGION"],
            public_base_url=app.config["S3_PUBLIC_BASE_URL"],
        )
    else:
        _storage = LocalStorage(
            base_dir=app.config["LOCAL_UPLOAD_DIR"],
            public_base_url=app.config["PUBLIC_MEDIA_BASE_URL"],
        )


def get_storage() -> Storage:
    if _storage is None:
        raise RuntimeError("Storage не инициализирован — вызовите init_storage(app) при старте приложения")
    return _storage


def new_photo_key(listing_id: int, variant: str) -> str:
    return f"listings/{listing_id}/{uuid.uuid4().hex}_{variant}.webp"
