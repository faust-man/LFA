import datetime
import io
from unittest.mock import MagicMock

import pytest

from backend.media import InvalidImageError, ProcessedImage


def _fake_processed(width=1920, height=1080, size=180_000):
    return ProcessedImage(data=b"fake-webp-bytes", width=width, height=height, size_bytes=size)


def test_list_photos_is_public(client, mock_db):
    mock_db["fetch_all"].return_value = []
    resp = client.get("/api/animals/1/photos")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_upload_requires_auth(client):
    resp = client.post("/api/animals/1/photos", data={}, content_type="multipart/form-data")
    assert resp.status_code == 401


def test_upload_rejects_missing_listing(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].return_value = None
    resp = client.post(
        "/api/animals/1/photos",
        data={"photo": (io.BytesIO(b"data"), "photo.jpg")},
        content_type="multipart/form-data",
        headers=auth_headers(),
    )
    assert resp.status_code == 404


def test_upload_rejects_non_owner(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].return_value = {"id": 1, "user_id": 999}
    resp = client.post(
        "/api/animals/1/photos",
        data={"photo": (io.BytesIO(b"data"), "photo.jpg")},
        content_type="multipart/form-data",
        headers=auth_headers(1),
    )
    assert resp.status_code == 403


def test_upload_rejects_missing_file(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].side_effect = [
        {"id": 1, "user_id": 1},  # владелец
        {"n": 0},                 # COUNT(*) фото на объявлении
    ]
    resp = client.post("/api/animals/1/photos", data={}, content_type="multipart/form-data", headers=auth_headers())
    assert resp.status_code == 400


def test_upload_rejects_when_limit_reached(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].side_effect = [
        {"id": 1, "user_id": 1},
        {"n": 8},  # уже максимум (MAX_PHOTOS_PER_LISTING)
    ]
    resp = client.post(
        "/api/animals/1/photos",
        data={"photo": (io.BytesIO(b"data"), "photo.jpg")},
        content_type="multipart/form-data",
        headers=auth_headers(),
    )
    assert resp.status_code == 400


def test_upload_rejects_invalid_image(client, app, mock_db, auth_headers, monkeypatch):
    from backend.routes import photos_routes

    mock_db["fetch_one"].side_effect = [{"id": 1, "user_id": 1}, {"n": 0}]
    monkeypatch.setattr(photos_routes, "process_photo", MagicMock(side_effect=InvalidImageError("плохое фото")))

    resp = client.post(
        "/api/animals/1/photos",
        data={"photo": (io.BytesIO(b"not-an-image"), "photo.jpg")},
        content_type="multipart/form-data",
        headers=auth_headers(),
    )
    assert resp.status_code == 400


def test_upload_success_first_photo_becomes_primary(client, app, mock_db, auth_headers, monkeypatch):
    from backend.routes import photos_routes

    mock_db["fetch_one"].side_effect = [
        {"id": 1, "user_id": 1},  # владелец
        {"n": 0},                 # первое фото объявления
    ]
    monkeypatch.setattr(
        photos_routes, "process_photo",
        MagicMock(return_value=(_fake_processed(), _fake_processed(300, 300, 25_000))),
    )

    fake_storage = MagicMock()
    fake_storage.save.side_effect = ["https://cdn.example/full.webp", "https://cdn.example/thumb.webp"]
    monkeypatch.setattr(photos_routes, "get_storage", lambda: fake_storage)
    monkeypatch.setattr(photos_routes, "new_photo_key", lambda listing_id, variant: f"key-{variant}")

    mock_db["execute_returning"].return_value = {
        "id": 7, "full_url": "https://cdn.example/full.webp", "thumb_url": "https://cdn.example/thumb.webp",
        "full_width": 1920, "full_height": 1080, "is_primary": True,
        "created_at": datetime.datetime.now(),
    }

    resp = client.post(
        "/api/animals/1/photos",
        data={"photo": (io.BytesIO(b"fake-image-bytes"), "photo.jpg")},
        content_type="multipart/form-data",
        headers=auth_headers(),
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["id"] == 7
    assert body["is_primary"] is True
    fake_storage.save.assert_any_call("key-full", b"fake-webp-bytes", "image/webp")


def test_upload_rolls_back_full_file_if_thumb_save_fails(client, app, mock_db, auth_headers, monkeypatch):
    """Если сохранение миниатюры упало после успешного сохранения
    полноразмерной версии, не должно оставаться "осиротевшего" файла."""
    from backend.routes import photos_routes

    mock_db["fetch_one"].side_effect = [{"id": 1, "user_id": 1}, {"n": 0}]
    monkeypatch.setattr(
        photos_routes, "process_photo",
        MagicMock(return_value=(_fake_processed(), _fake_processed())),
    )
    fake_storage = MagicMock()
    fake_storage.save.side_effect = ["https://cdn.example/full.webp", RuntimeError("storage down")]
    monkeypatch.setattr(photos_routes, "get_storage", lambda: fake_storage)
    monkeypatch.setattr(photos_routes, "new_photo_key", lambda listing_id, variant: f"key-{variant}")

    # При TESTING=True Flask по умолчанию пробрасывает необработанные
    # исключения наружу (а не превращает их в 500) — проверяем сам факт
    # отката, а не HTTP-ответ.
    with pytest.raises(RuntimeError):
        client.post(
            "/api/animals/1/photos",
            data={"photo": (io.BytesIO(b"x"), "photo.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers(),
        )

    fake_storage.delete.assert_called_once_with("key-full")


def test_delete_photo_not_found(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].side_effect = [
        {"id": 1, "user_id": 1},  # владелец
        None,                     # фото не найдено
    ]
    resp = client.delete("/api/animals/1/photos/999", headers=auth_headers())
    assert resp.status_code == 404


def test_delete_photo_forbidden_for_non_owner(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].return_value = {"id": 1, "user_id": 999}
    resp = client.delete("/api/animals/1/photos/5", headers=auth_headers(1))
    assert resp.status_code == 403
