# === Импорты ===
import os
import re
import base64
import binascii
from datetime import datetime
import psycopg
from flask import Flask, jsonify, request
from psycopg.rows import dict_row
from psycopg.conninfo import make_conninfo

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.exceptions import RequestEntityTooLarge

if __package__:
    from .duplicates import DuplicateRecord, lock_writes, check_duplicate, check_update
else:
    from duplicates import DuplicateRecord, lock_writes, check_duplicate, check_update


# === Создание приложения ===
app = Flask(__name__)
MAX_PHOTO_BYTES = 5 * 1024 * 1024
# Base64 adds roughly one third to the image size; reserve room for other fields.
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

DATABASE_URL = os.getenv("DATABASE_URL") or make_conninfo(
    host=os.getenv("PGHOST", "database"),
    port=os.getenv("PGPORT", "5432"),
    dbname=os.getenv("POSTGRES_DB", "animals_db"),
    user=os.getenv("POSTGRES_USER", "animal_user"),
    password=os.getenv("POSTGRES_PASSWORD", "animal_password"),
    connect_timeout=5,
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    storage_uri=REDIS_URL,
    default_limits=[],
    headers_enabled=True
)

# ============ ВАЛИДАЦИЯ ============

TIME_REGEX = re.compile(r"^([0-1][0-9]|2[0-3]):[0-5][0-9]$")
DATE_REGEX = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")


def db(sql, params=(), fetch="one", duplicate_table=None, duplicate_update=None):
    """Единая безопасная точка общения с PostgreSQL."""
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            if duplicate_table is not None:
                lock_writes(cur, duplicate_table)
                check_duplicate(cur, duplicate_table, params)
            if duplicate_update is not None:
                table, record_id, changes = duplicate_update
                check_update(cur, table, record_id, changes)
            cur.execute(sql, params)
            if fetch == "one":
                return cur.fetchone()
            elif fetch == "all":
                return cur.fetchall()
            return None


def to_json(row):
    """Преобразует TIMESTAMPTZ в ISO-строку."""
    if row is None:
        return None
    return {
        key: (value.isoformat() if isinstance(value, datetime) else value)
        for key, value in row.items()
    }


def validate_common(data):
    """Общая валидация для метки и объявления."""
    errors = []

    photo = data.get("photo_data")
    if isinstance(photo, str) and photo:
        header, separator, encoded = photo.partition(",")
        if not separator or not re.fullmatch(r"data:image/[a-zA-Z0-9.+-]+;base64", header):
            errors.append("photo_data должен содержать изображение в формате data URL base64")
        elif len(encoded) > 4 * ((MAX_PHOTO_BYTES + 2) // 3):
            raise RequestEntityTooLarge(description="Фото должно быть не больше 5 МБ")
        else:
            try:
                decoded = base64.b64decode(encoded, validate=True)
                if len(decoded) > MAX_PHOTO_BYTES:
                    raise RequestEntityTooLarge(description="Фото должно быть не больше 5 МБ")
            except (ValueError, binascii.Error):
                errors.append("Некорректные данные фотографии base64")

    text_limits = {
        "name": 100, "nickname": 100, "species": 50, "color": 100,
        "observed_time": 5, "lost_time": 5, "observed_date": 10,
        "lost_date": 10, "behavior": None, "state": None,
        "contact": 200, "address": None, "character": None, "photo_data": None,
    }
    for field, maximum in text_limits.items():
        value = data.get(field)
        if value is not None:
            if not isinstance(value, str):
                errors.append(f"{field} должен быть строкой")
            elif maximum is not None and len(value) > maximum:
                errors.append(f"{field}: максимум {maximum} символов")
    if "ready" in data and not isinstance(data["ready"], bool):
        errors.append("ready должен быть логическим значением")

    if "observed_time" in data and data["observed_time"] not in (None, ""):
        if not TIME_REGEX.fullmatch(str(data["observed_time"])):
            errors.append("Некорректный формат observed_time. Ожидается ЧЧ:ММ")

    if "lost_time" in data and data["lost_time"] not in (None, ""):
        if not TIME_REGEX.fullmatch(str(data["lost_time"])):
            errors.append("Некорректный формат lost_time. Ожидается ЧЧ:ММ")

    for field in ("observed_date", "lost_date"):
        if field in data and data[field] not in (None, ""):
            if not DATE_REGEX.fullmatch(str(data[field])):
                errors.append(f"Некорректный формат {field}. Ожидается ДД.ММ.ГГГГ")
            else:
                try:
                    datetime.strptime(data[field], "%d.%m.%Y")
                except (ValueError, TypeError):
                    errors.append(f"Некорректная дата {field}")

    if "latitude" in data and data["latitude"] is not None:
        try:
            lat = float(data["latitude"])
            if isinstance(data["latitude"], bool) or not (-90 <= lat <= 90):
                errors.append("Широта вне диапазона -90..90")
        except (ValueError, TypeError):
            errors.append("Широта должна быть числом")

    if "longitude" in data and data["longitude"] is not None:
        try:
            lon = float(data["longitude"])
            if isinstance(data["longitude"], bool) or not (-180 <= lon <= 180):
                errors.append("Долгота вне диапазона -180..180")
        except (ValueError, TypeError):
            errors.append("Долгота должна быть числом")

    return errors


# ==========================================
# ===   API: ЗАМЕЧЕННЫЕ ЖИВОТНЫЕ        ===
# ==========================================

@app.get("/api/animals")
@limiter.limit("5 per minute")
def list_animals():
    rows = db("SELECT * FROM animals ORDER BY id", fetch="all")
    return jsonify([to_json(row) for row in rows])


@app.get("/api/animals/<int:animal_id>")
@limiter.limit("5 per minute")
def get_animal(animal_id):
    row = db("SELECT * FROM animals WHERE id = %s", (animal_id,))
    if row is None:
        return jsonify({"error": "Метка не найдена"}), 404
    return jsonify(to_json(row))


@app.post("/api/animals")
@limiter.limit("5 per minute")
def create_animal():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400

    if (not isinstance(data.get("species"), str) or not data["species"].strip()
            or data.get("latitude") is None
            or data.get("longitude") is None):
        return jsonify({"error": "species, latitude, longitude обязательны"}), 400

    errors = validate_common(data)
    if errors:
        return jsonify({"errors": errors}), 400

    row = db(
        """
        INSERT INTO animals (
            name, species, color, observed_time, observed_date,
            latitude, longitude, photo_data,
            behavior, state, ready, contact, address
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            data.get("name") or "Без имени",
            str(data["species"]).strip(),
            data.get("color") or "",
            data.get("observed_time") or "",
            data.get("observed_date") or "",
            data["latitude"],
            data["longitude"],
            data.get("photo_data"),
            data.get("behavior") or "",
            data.get("state") or "",
            bool(data.get("ready", False)),
            data.get("contact") or "",
            data.get("address") or "",
        ),
        duplicate_table="animals",
    )
    return jsonify(to_json(row)), 201


@app.patch("/api/animals/<int:animal_id>")
@limiter.limit("5 per minute")
def update_animal(animal_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400
    allowed = {
        "name", "species", "color", "observed_time", "observed_date",
        "latitude", "longitude", "photo_data", "behavior", "state",
        "ready", "contact", "address",
    }
    fields = {key: value for key, value in data.items() if key in allowed}
    if not fields:
        return jsonify({"error": "Нет полей для обновления"}), 400
    if any(value is None and key != "photo_data" for key, value in fields.items()):
        return jsonify({"error": "Обязательные поля не могут быть null"}), 400
    if "species" in fields and (not isinstance(fields["species"], str) or not fields["species"].strip()):
        return jsonify({"error": "species обязателен"}), 400
    errors = validate_common(fields)
    if errors:
        return jsonify({"errors": errors}), 400
    assignments = ", ".join(f"{field} = %s" for field in fields)
    row = db(
        f"UPDATE animals SET {assignments} WHERE id = %s RETURNING *",
        tuple(fields.values()) + (animal_id,),
        duplicate_update=("animals", animal_id, fields),
    )
    if row is None:
        return jsonify({"error": "Метка не найдена"}), 404
    return jsonify(to_json(row))


@app.delete("/api/animals/<int:animal_id>")
@limiter.limit("5 per minute")
def delete_animal(animal_id):
    row = db("DELETE FROM animals WHERE id = %s RETURNING id", (animal_id,))
    if row is None:
        return jsonify({"error": "Метка не найдена"}), 404
    return "", 204


# ==========================================
# ===   API: ПРОПАВШИЕ ЖИВОТНЫЕ         ===
# ==========================================

@app.get("/api/lost_ads")
@limiter.limit("5 per minute")
def list_lost_ads():
    rows = db("SELECT * FROM lost_ads ORDER BY id", fetch="all")
    return jsonify([to_json(row) for row in rows])


@app.post("/api/lost_ads")
@limiter.limit("5 per minute")
def create_lost_ad():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400

    required = ("nickname", "character", "contact", "species")
    missing = [f for f in required if not isinstance(data.get(f), str) or not data[f].strip()]
    if missing:
        return jsonify({"error": f"Обязательные поля: {', '.join(missing)}"}), 400

    errors = validate_common(data)
    if errors:
        return jsonify({"errors": errors}), 400

    row = db(
        """
        INSERT INTO lost_ads (
            nickname, character, contact, species, color,
            lost_time, lost_date, address,
            latitude, longitude, photo_data
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            str(data["nickname"]).strip(),
            str(data["character"]).strip(),
            str(data["contact"]).strip(),
            str(data["species"]).strip(),
            data.get("color") or "",
            data.get("lost_time") or "",
            data.get("lost_date") or "",
            data.get("address") or "",
            data.get("latitude"),
            data.get("longitude"),
            data.get("photo_data"),
        ),
        duplicate_table="lost_ads",
    )
    return jsonify(to_json(row)), 201


@app.delete("/api/lost_ads/<int:ad_id>")
@limiter.limit("5 per minute")
def delete_lost_ad(ad_id):
    row = db("DELETE FROM lost_ads WHERE id = %s RETURNING id", (ad_id,))
    if row is None:
        return jsonify({"error": "Объявление не найдено"}), 404
    return "", 204


# ==========================================
# ===   HEALTHCHECK                       ===
# ==========================================
@app.get("/health")
@limiter.exempt
def health():
    try:
        db("SELECT observed_date, behavior, state, ready, contact, address FROM animals LIMIT 0")
        db("SELECT id FROM lost_ads LIMIT 0")
        return jsonify({"status": "ok", "database": "ok"}), 200
    except psycopg.Error:
        return jsonify({"status": "error", "database": "unavailable"}), 503


@app.errorhandler(psycopg.DataError)
@app.errorhandler(psycopg.IntegrityError)
def invalid_database_input(error):
    return jsonify({"error": "Некорректные данные"}), 400


@app.errorhandler(DuplicateRecord)
def duplicate_record(error):
    return jsonify({"error": "Такая запись уже существует", "existing_id": error.record_id}), 409


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(error):
    message = error.description if error.description == "Фото должно быть не больше 5 МБ" else "Размер запроса превышает 8 МБ (фото — до 5 МБ)"
    return jsonify({"error": message}), 413


@app.errorhandler(psycopg.OperationalError)
def database_unavailable(error):
    app.logger.exception("PostgreSQL unavailable")
    return jsonify({"error": "База данных временно недоступна"}), 503


@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({
        "error": "Слишком много запросов",
        "message": "Пожалуйста, подождите."
    }), 429


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
