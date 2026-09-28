from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from .. import db, auth
from ..security import limiter, sanitize_text, validate_url

bp = Blueprint("animals", __name__, url_prefix="/api/animals")

ALLOWED_SIZES = {"small", "medium", "large"}
ALLOWED_STATUSES = {"missing", "found"}

LISTING_ANIMAL_SELECT = """
    SELECT
        l.id, l.title, l.description, l.latitude, l.longitude, l.map_link,
        l.status, l.reward_amount, l.created_at, l.updated_at, l.found_at,
        l.user_id,
        a.id AS animal_id, a.name, a.species, a.breed, a.color, a.size,
        a.weight_kg, a.fur_type, a.eye_color,
        (SELECT p.thumb_url FROM photos p WHERE p.listing_id = l.id
           ORDER BY p.is_primary DESC, p.created_at ASC LIMIT 1) AS primary_photo_thumb_url
    FROM listings l
    JOIN animals a ON a.listing_id = l.id
"""


def _row_to_dict(row: dict) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "reward_amount": float(row["reward_amount"]),
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "map_link": row["map_link"],
        "primary_photo_thumb_url": row["primary_photo_thumb_url"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "found_at": row["found_at"].isoformat() if row["found_at"] else None,
        "user_id": row["user_id"],
        "animal": {
            "id": row["animal_id"],
            "name": row["name"],
            "species": row["species"],
            "breed": row["breed"],
            "color": row["color"],
            "size": row["size"],
            "weight_kg": float(row["weight_kg"]) if row["weight_kg"] is not None else None,
            "fur_type": row["fur_type"],
            "eye_color": row["eye_color"],
        },
    }


@bp.route("", methods=["GET"])
def list_animals():
    """Список объявлений для отображения на карте. Поддерживает фильтры:
    ?species=cat&status=missing&min_lat=..&max_lat=..&min_lng=..&max_lng=.."""
    species = request.args.get("species")
    status = request.args.get("status")

    query = LISTING_ANIMAL_SELECT + " WHERE l.is_active = TRUE"
    params: list = []

    if species:
        query += " AND a.species = %s"
        params.append(species)

    if status:
        if status not in ALLOWED_STATUSES:
            return jsonify({"error": "Недопустимый статус"}), 400
        query += " AND l.status = %s"
        params.append(status)

    # Ограничение области карты (bounding box), опционально
    for key, sql_field, op in (
        ("min_lat", "l.latitude", ">="), ("max_lat", "l.latitude", "<="),
        ("min_lng", "l.longitude", ">="), ("max_lng", "l.longitude", "<="),
    ):
        raw = request.args.get(key)
        if raw is not None:
            try:
                value = float(raw)
            except ValueError:
                return jsonify({"error": f"Некорректное значение параметра {key}"}), 400
            query += f" AND {sql_field} {op} %s"
            params.append(value)

    query += " ORDER BY l.created_at DESC LIMIT 200"

    rows = db.fetch_all(query, tuple(params))
    return jsonify([_row_to_dict(r) for r in rows]), 200


@bp.route("/<int:listing_id>", methods=["GET"])
def get_animal(listing_id: int):
    row = db.fetch_one(LISTING_ANIMAL_SELECT + " WHERE l.id = %s AND l.is_active = TRUE", (listing_id,))
    if not row:
        return jsonify({"error": "Не найдено"}), 404

    result = _row_to_dict(row)
    photos = db.fetch_all(
        """SELECT id, full_url, thumb_url, full_width, full_height, is_primary, created_at
           FROM photos WHERE listing_id = %s ORDER BY is_primary DESC, created_at ASC""",
        (listing_id,),
    )
    result["photos"] = [
        {
            "id": p["id"], "full_url": p["full_url"], "thumb_url": p["thumb_url"],
            "width": p["full_width"], "height": p["full_height"],
            "is_primary": p["is_primary"], "created_at": p["created_at"].isoformat(),
        }
        for p in photos
    ]
    return jsonify(result), 200


@bp.route("", methods=["POST"])
@jwt_required()
@limiter.limit("20 per hour")  # защита от спам-публикаций
def create_animal():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400

    required = ("title", "species", "latitude", "longitude")
    if any(field not in data for field in required):
        return jsonify({"error": "Отсутствуют обязательные поля: " + ", ".join(required)}), 400

    title = sanitize_text(data["title"], 150)
    species = sanitize_text(data["species"], 50)
    if not title:
        return jsonify({"error": "Название объявления не может быть пустым"}), 400
    if not species:
        return jsonify({"error": "Вид животного не может быть пустым"}), 400

    try:
        latitude = float(data["latitude"])
        longitude = float(data["longitude"])
    except (TypeError, ValueError):
        return jsonify({"error": "Координаты должны быть числами"}), 400

    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return jsonify({"error": "Координаты вне допустимого диапазона"}), 400

    reward = data.get("reward_amount", 0)
    try:
        reward = float(reward)
    except (TypeError, ValueError):
        return jsonify({"error": "reward_amount должно быть числом"}), 400
    if reward < 0:
        return jsonify({"error": "reward_amount не может быть отрицательным"}), 400

    size = data.get("size")
    if size is not None and size not in ALLOWED_SIZES:
        return jsonify({"error": "Недопустимый размер животного"}), 400

    weight_kg = data.get("weight_kg")
    if weight_kg is not None:
        try:
            weight_kg = float(weight_kg)
        except (TypeError, ValueError):
            return jsonify({"error": "weight_kg должно быть числом"}), 400
        if weight_kg <= 0:
            return jsonify({"error": "weight_kg должно быть положительным числом"}), 400

    try:
        map_link = validate_url(data.get("map_link"), 500)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    user_id = int(get_jwt_identity())
    description = sanitize_text(data.get("description"), 2000)

    listing = db.execute_returning(
        """
        INSERT INTO listings
            (user_id, title, description, latitude, longitude, ip_address,
             map_link, reward_amount)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, title, description, latitude, longitude, map_link,
                  status, reward_amount, created_at, updated_at, found_at, user_id
        """,
        (
            user_id, title, description, latitude, longitude, request.remote_addr,
            map_link, reward,
        ),
    )

    animal = db.execute_returning(
        """
        INSERT INTO animals
            (listing_id, name, species, breed, color, size, weight_kg, fur_type, eye_color)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, name, species, breed, color, size, weight_kg, fur_type, eye_color
        """,
        (
            listing["id"],
            sanitize_text(data.get("name"), 100),
            species,
            sanitize_text(data.get("breed"), 100),
            sanitize_text(data.get("color"), 100),
            size,
            weight_kg,
            sanitize_text(data.get("fur_type"), 50),
            sanitize_text(data.get("eye_color"), 50),
        ),
    )

    auth.log_audit(user_id, "listing_created", request.remote_addr, {"listing_id": listing["id"]})

    # Собираем ответ вручную (а не через слияние словарей listing+animal),
    # т.к. оба словаря содержат ключ "id" — их прямое объединение затирало бы
    # id объявления id-шником животного.
    row = {
        **listing,
        "primary_photo_thumb_url": None,  # фото загружаются отдельно — см. POST .../photos
        "animal_id": animal["id"],
        "name": animal["name"],
        "species": animal["species"],
        "breed": animal["breed"],
        "color": animal["color"],
        "size": animal["size"],
        "weight_kg": animal["weight_kg"],
        "fur_type": animal["fur_type"],
        "eye_color": animal["eye_color"],
    }
    return jsonify(_row_to_dict(row)), 201


@bp.route("/<int:listing_id>", methods=["PATCH"])
@jwt_required()
def update_animal(listing_id: int):
    """Обновление объявления: смена геопозиции публикации, статуса
    (пропал/нашёлся — с уведомлением), суммы вознаграждения и т.д.
    Только владелец объявления может его менять."""
    owner = db.fetch_one("SELECT user_id FROM listings WHERE id = %s AND is_active = TRUE", (listing_id,))
    if not owner:
        return jsonify({"error": "Не найдено"}), 404

    current_user_id = int(get_jwt_identity())
    if owner["user_id"] != current_user_id:
        return jsonify({"error": "Недостаточно прав"}), 403

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400

    updates, params = [], []

    if "latitude" in data and "longitude" in data:
        try:
            lat, lng = float(data["latitude"]), float(data["longitude"])
        except (TypeError, ValueError):
            return jsonify({"error": "Координаты должны быть числами"}), 400
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return jsonify({"error": "Координаты вне допустимого диапазона"}), 400
        updates += ["latitude = %s", "longitude = %s"]
        params += [lat, lng]

    if "status" in data:
        if data["status"] not in ALLOWED_STATUSES:
            return jsonify({"error": "Недопустимый статус"}), 400
        updates.append("status = %s")
        params.append(data["status"])
        if data["status"] == "found":
            updates.append("found_at = NOW()")

    if "reward_amount" in data:
        try:
            reward = float(data["reward_amount"])
        except (TypeError, ValueError):
            return jsonify({"error": "reward_amount должно быть числом"}), 400
        if reward < 0:
            return jsonify({"error": "reward_amount не может быть отрицательным"}), 400
        updates.append("reward_amount = %s")
        params.append(reward)

    if not updates:
        return jsonify({"error": "Нет полей для обновления"}), 400

    params.append(listing_id)
    db.execute(f"UPDATE listings SET {', '.join(updates)} WHERE id = %s", tuple(params))

    if data.get("status") == "found":
        _notify_found(listing_id)

    auth.log_audit(current_user_id, "listing_updated", request.remote_addr, {"listing_id": listing_id})

    row = db.fetch_one(LISTING_ANIMAL_SELECT + " WHERE l.id = %s", (listing_id,))
    return jsonify(_row_to_dict(row)), 200


@bp.route("/<int:listing_id>", methods=["DELETE"])
@jwt_required()
def delete_animal(listing_id: int):
    owner = db.fetch_one("SELECT user_id FROM listings WHERE id = %s", (listing_id,))
    if not owner:
        return jsonify({"error": "Не найдено"}), 404

    current_user_id = int(get_jwt_identity())
    if owner["user_id"] != current_user_id:
        return jsonify({"error": "Недостаточно прав"}), 403

    db.execute("UPDATE listings SET is_active = FALSE WHERE id = %s", (listing_id,))
    auth.log_audit(current_user_id, "listing_deleted", request.remote_addr, {"listing_id": listing_id})
    return "", 204


def _notify_found(listing_id: int) -> None:
    """Создаёт уведомления всем участникам чатов по объявлению о том,
    что животное нашлось."""
    participants = db.fetch_all(
        """
        SELECT DISTINCT initiator_id AS user_id FROM chats WHERE listing_id = %s
        UNION
        SELECT DISTINCT owner_id AS user_id FROM chats WHERE listing_id = %s
        """,
        (listing_id, listing_id),
    )
    for p in participants:
        db.execute(
            """
            INSERT INTO notifications (user_id, listing_id, type, message)
            VALUES (%s, %s, 'animal_found', 'Животное из объявления найдено!')
            """,
            (p["user_id"], listing_id),
        )
