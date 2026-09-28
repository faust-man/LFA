from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from .. import auth, db
from ..media import InvalidImageError, process_photo
from ..security import limiter
from ..storage import get_storage, new_photo_key

bp = Blueprint("photos", __name__, url_prefix="/api/animals")

MAX_PHOTOS_PER_LISTING = 8


def _owned_active_listing(listing_id: int, user_id: int):
    """Возвращает объявление, если оно существует и принадлежит user_id;
    (listing_or_none, error_response_or_none)."""
    listing = db.fetch_one(
        "SELECT id, user_id FROM listings WHERE id = %s AND is_active = TRUE", (listing_id,)
    )
    if not listing:
        return None, (jsonify({"error": "Объявление не найдено"}), 404)
    if listing["user_id"] != user_id:
        return None, (jsonify({"error": "Недостаточно прав"}), 403)
    return listing, None


def _photo_to_dict(p: dict) -> dict:
    return {
        "id": p["id"],
        "full_url": p["full_url"],
        "thumb_url": p["thumb_url"],
        "width": p["full_width"],
        "height": p["full_height"],
        "is_primary": p["is_primary"],
        "created_at": p["created_at"].isoformat(),
    }


@bp.route("/<int:listing_id>/photos", methods=["GET"])
def list_photos(listing_id: int):
    """Публичный список фото объявления — не требует авторизации, как и
    сами объявления на карте."""
    photos = db.fetch_all(
        """
        SELECT id, full_url, thumb_url, full_width, full_height, is_primary, created_at
        FROM photos WHERE listing_id = %s
        ORDER BY is_primary DESC, created_at ASC
        """,
        (listing_id,),
    )
    return jsonify([_photo_to_dict(p) for p in photos]), 200


@bp.route("/<int:listing_id>/photos", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")  # защита от заваливания хранилища спам-загрузками
def upload_photo(listing_id: int):
    """Принимает multipart/form-data с полем 'photo'. Автоматически:
    приводит к WebP, создаёт полноразмерную версию (до 1920x1080, ~200 КБ)
    и миниатюру (300x300, ~30 КБ) — см. backend/media.py — и сохраняет их
    через настроенное хранилище (backend/storage.py: диск или S3)."""
    user_id = int(get_jwt_identity())
    listing, error = _owned_active_listing(listing_id, user_id)
    if error:
        return error

    count_row = db.fetch_one("SELECT COUNT(*) AS n FROM photos WHERE listing_id = %s", (listing_id,))
    if count_row["n"] >= MAX_PHOTOS_PER_LISTING:
        return jsonify({"error": f"Не более {MAX_PHOTOS_PER_LISTING} фото на одно объявление"}), 400

    file = request.files.get("photo")
    if file is None or not file.filename:
        return jsonify({"error": "Файл не передан (поле формы должно называться 'photo')"}), 400

    raw = file.read()
    try:
        full, thumb = process_photo(raw)
    except InvalidImageError as e:
        return jsonify({"error": str(e)}), 400

    storage = get_storage()
    full_key = new_photo_key(listing_id, "full")
    thumb_key = new_photo_key(listing_id, "thumb")
    full_url = storage.save(full_key, full.data, "image/webp")
    try:
        thumb_url = storage.save(thumb_key, thumb.data, "image/webp")
    except Exception:
        storage.delete(full_key)  # не оставляем "осиротевший" файл при частичном сбое
        raise

    is_primary = count_row["n"] == 0  # первое загруженное фото — главное по умолчанию
    photo = db.execute_returning(
        """
        INSERT INTO photos
            (listing_id, uploaded_by, storage_backend,
             full_key, full_url, full_width, full_height, full_size_bytes,
             thumb_key, thumb_url, thumb_size_bytes, is_primary)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, full_url, thumb_url, full_width, full_height, is_primary, created_at
        """,
        (
            listing_id, user_id, current_app.config["STORAGE_BACKEND"],
            full_key, full_url, full.width, full.height, full.size_bytes,
            thumb_key, thumb_url, thumb.size_bytes, is_primary,
        ),
    )

    auth.log_audit(user_id, "photo_uploaded", request.remote_addr,
                    {"listing_id": listing_id, "photo_id": photo["id"]})
    return jsonify(_photo_to_dict(photo)), 201


@bp.route("/<int:listing_id>/photos/<int:photo_id>", methods=["DELETE"])
@jwt_required()
def delete_photo(listing_id: int, photo_id: int):
    user_id = int(get_jwt_identity())
    listing, error = _owned_active_listing(listing_id, user_id)
    if error:
        return error

    photo = db.fetch_one(
        "SELECT full_key, thumb_key FROM photos WHERE id = %s AND listing_id = %s",
        (photo_id, listing_id),
    )
    if not photo:
        return jsonify({"error": "Фото не найдено"}), 404

    storage = get_storage()
    storage.delete(photo["full_key"])
    storage.delete(photo["thumb_key"])
    db.execute("DELETE FROM photos WHERE id = %s", (photo_id,))

    auth.log_audit(user_id, "photo_deleted", request.remote_addr,
                    {"listing_id": listing_id, "photo_id": photo_id})
    return "", 204


@bp.route("/<int:listing_id>/photos/<int:photo_id>/primary", methods=["PATCH"])
@jwt_required()
def set_primary_photo(listing_id: int, photo_id: int):
    """Делает фото главным (отображается первым в карточке/на карте)."""
    user_id = int(get_jwt_identity())
    listing, error = _owned_active_listing(listing_id, user_id)
    if error:
        return error

    photo = db.fetch_one("SELECT id FROM photos WHERE id = %s AND listing_id = %s", (photo_id, listing_id))
    if not photo:
        return jsonify({"error": "Фото не найдено"}), 404

    db.execute("UPDATE photos SET is_primary = FALSE WHERE listing_id = %s", (listing_id,))
    db.execute("UPDATE photos SET is_primary = TRUE WHERE id = %s", (photo_id,))
    return jsonify({"message": "Главное фото обновлено"}), 200
