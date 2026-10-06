# === Импорты ===
import os
import re
from datetime import datetime
import psycopg
from flask import Flask, jsonify, request
from psycopg.rows import dict_row

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_cors import CORS


# === Создание приложения ===
app = Flask(__name__)

# CORS: разрешаем фронтенду (с любого origin, на проде — сузьте)
CORS(app, resources={r"/api/*": {"origins": "*"}, r"/health": {"origins": "*"}})

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

DATABASE_URL = os.environ["DATABASE_URL"]
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


def db(sql, params=(), fetch="one"):
    """Единая безопасная точка общения с PostgreSQL."""
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
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

    if "observed_time" in data and data["observed_time"] not in (None, ""):
        if not TIME_REGEX.match(str(data["observed_time"])):
            errors.append("Некорректный формат observed_time. Ожидается ЧЧ:ММ")

    if "lost_time" in data and data["lost_time"] not in (None, ""):
        if not TIME_REGEX.match(str(data["lost_time"])):
            errors.append("Некорректный формат lost_time. Ожидается ЧЧ:ММ")

    for field in ("observed_date", "lost_date"):
        if field in data and data[field] not in (None, ""):
            if not DATE_REGEX.match(str(data[field])):
                errors.append(f"Некорректный формат {field}. Ожидается ДД.ММ.ГГГГ")

    if "latitude" in data and data["latitude"] is not None:
        try:
            lat = float(data["latitude"])
            if not (-90 <= lat <= 90):
                errors.append("Широта вне диапазона -90..90")
        except (ValueError, TypeError):
            errors.append("Широта должна быть числом")

    if "longitude" in data and data["longitude"] is not None:
        try:
            lon = float(data["longitude"])
            if not (-180 <= lon <= 180):
                errors.append("Долгота вне диапазона -180..180")
        except (ValueError, TypeError):
            errors.append("Долгота должна быть числом")

    return errors


# ==========================================
# ===   API: ЗАМЕЧЕННЫЕ ЖИВОТНЫЕ        ===
# ==========================================

@app.get("/api/animals")
@limiter.limit("30 per minute")
def list_animals():
    rows = db("SELECT * FROM animals ORDER BY id", fetch="all")
    return jsonify([to_json(row) for row in rows])


@app.get("/api/animals/<int:animal_id>")
@limiter.limit("30 per minute")
def get_animal(animal_id):
    row = db("SELECT * FROM animals WHERE id = %s", (animal_id,))
    if row is None:
        return jsonify({"error": "Метка не найдена"}), 404
    return jsonify(to_json(row))


@app.post("/api/animals")
@limiter.limit("30 per minute")
def create_animal():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400

    if (data.get("species") is None
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
    )
    return jsonify(to_json(row)), 201


@app.delete("/api/animals/<int:animal_id>")
@limiter.limit("30 per minute")
def delete_animal(animal_id):
    row = db("DELETE FROM animals WHERE id = %s RETURNING id", (animal_id,))
    if row is None:
        return jsonify({"error": "Метка не найдена"}), 404
    return "", 204


# ==========================================
# ===   API: ПРОПАВШИЕ ЖИВОТНЫЕ         ===
# ==========================================

@app.get("/api/lost_ads")
@limiter.limit("30 per minute")
def list_lost_ads():
    rows = db("SELECT * FROM lost_ads ORDER BY id", fetch="all")
    return jsonify([to_json(row) for row in rows])


@app.post("/api/lost_ads")
@limiter.limit("30 per minute")
def create_lost_ad():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400

    required = ("nickname", "character", "contact", "species")
    missing = [f for f in required if not data.get(f)]
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
    )
    return jsonify(to_json(row)), 201


@app.delete("/api/lost_ads/<int:ad_id>")
@limiter.limit("30 per minute")
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
        db("SELECT 1", fetch="one")
        return jsonify({"status": "ok", "database": "ok"}), 200
    except psycopg.Error:
        return jsonify({"status": "error", "database": "unavailable"}), 503


@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({
        "error": "Слишком много запросов",
        "message": "Пожалуйста, подождите."
    }), 429


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)