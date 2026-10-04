# === Импорты ===
import os  # Для чтения переменных окружения (DATABASE_URL, REDIS_URL)
import re  # Для строгой валидации формата времени регулярным выражением
from datetime import datetime  # Чтобы отличать дату/время при превращении строки БД в JSON
import psycopg  # Современная библиотека для работы с PostgreSQL (psycopg3)
from flask import Flask, jsonify, request  # Flask для маршрутизации и работы с JSON
from psycopg.rows import dict_row  # Чтобы строки из БД приходили как словари {"id": 1, ...}


# Компоненты для лимитера запросов (Rate Limiting)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
# Middleware для корректного чтения IP за прокси-серверами (Nginx, Traefik, Cloudflare)
from werkzeug.middleware.proxy_fix import ProxyFix


# === Создание приложения ===
app = Flask(__name__)

# Прослойка ProxyFix защищает от подмены IP-адресов клиентами.
# Доверяем одному вышестоящему прокси (контейнеру Nginx/Reverse Proxy)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

# Конфигурация подключений из Docker-окружения
DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Инициализируем лимитер с персистентным хранилищем в Redis
limiter = Limiter(
    key_func=get_remote_address,  # Идентифицируем пользователей строго по IP
    app=app,
    storage_uri=REDIS_URL,        # Лимиты не сбрасываются при перезапуске контейнера бэкенда
    default_limits=[],            # Глобальные лимиты отключены, настраиваем эндпоинты точечно
    headers_enabled=True          # Возвращает клиенту заголовки X-RateLimit-*
)

# Обязательные поля для создания новой метки
REQUIRED_FIELDS = ("species", "latitude", "longitude")
# Белый список полей, разрешенных к изменению (защита от Mass Assignment)
EDITABLE_FIELDS = {"name", "species", "color", "observed_time", "latitude", "longitude", "photo_data"}

# Регулярное выражение для проверки 24-часового формата времени (ЧЧ:ММ)
TIME_REGEX = re.compile(r"^([0-1][0-9]|2[0-3]):[0-5][0-9]$")


def db(sql, params=(), fetch="one"):
    """
    Единая безопасная точка общения с базой данных.
    В psycopg3 режим autocommit управляется на уровне соединения. 
    Для пишущих операций (INSERT/UPDATE/DELETE) context manager автоматически
    фиксирует (COMMIT) транзакцию при успешном выходе или откатывает (ROLLBACK) при ошибке.
    """
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            if fetch == "one":
                return cur.fetchone()
            elif fetch == "all":
                return cur.fetchall()
            return None


def to_json(row):
    """Преобразует типы данных PostgreSQL (например, TIMESTAMPTZ) в JSON-совместимый формат."""
    if row is None:
        return None
    return {key: (value.isoformat() if isinstance(value, datetime) else value) for key, value in row.items()}


def validate_animal_data(data):
    """
    Функция валидации входящих данных перед отправкой в БД.
    Возвращает список ошибок. Если список пуст — данные валидны.
    Предотвращает падение сервера с ошибкой 500.
    """
    errors = []

    # Валидация формата времени, если оно передано и не пустое
    if "observed_time" in data and data["observed_time"] not in (None, ""):
        if not TIME_REGEX.match(str(data["observed_time"])):
            errors.append("Некорректный формат observed_time. Ожидается ЧЧ:ММ (от 00:00 до 23:59)")

    # Валидация широты (latitude)
    if "latitude" in data and data["latitude"] is not None:
        try:
            lat = float(data["latitude"])
            if not (-90 <= lat <= 90):
                errors.append("Широта (latitude) должна быть в диапазоне от -90 до 90 градусов")
        except (ValueError, TypeError):
            errors.append("Широта (latitude) должна быть валидным числом с плавающей точкой")

    # Валидация долготы (longitude)
    if "longitude" in data and data["longitude"] is not None:
        try:
            lon = float(data["longitude"])
            if not (-180 <= lon <= 180):
                errors.append("Долгота (longitude) должна быть в диапазоне от -180 до 180 градусов")
        except (ValueError, TypeError):
            errors.append("Долгота (longitude) должна быть валидным числом с плавающей точкой")

    return errors


# ==========================================
# ===   API ЭНДПОИНТЫ (МАРШРУТЫ FLASK)   ===
# ==========================================

# === 1. Получить список всех меток ===
@app.get("/api/animals")
@limiter.limit("1 per 10 seconds")
def list_animals():
    rows = db("SELECT * FROM animals ORDER BY id", fetch="all")
    return jsonify([to_json(row) for row in rows])


# === 2. Получить конкретную метку по ID ===
@app.get("/api/animals/<int:animal_id>")
@limiter.limit("1 per 10 seconds")
def get_animal(animal_id):
    row = db("SELECT * FROM animals WHERE id = %s", (animal_id,))
    if row is None:
        return jsonify({"error": "Метка не найдена"}), 404
    return jsonify(to_json(row))


# === 3. Создать новую метку ===
@app.post("/api/animals")
@limiter.limit("1 per 10 seconds")
def create_animal():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный или пустой JSON"}), 400

    # Проверка обязательных полей на присутствие и не-null значения
    missing_fields = [field for field in REQUIRED_FIELDS if data.get(field) is None]
    if missing_fields:
        return jsonify({"error": f"Не заполнены обязательные поля: {', '.join(missing_fields)}"}), 400

    # Запускаем строгую валидацию типов и форматов (время, координаты)
    validation_errors = validate_animal_data(data)
    if validation_errors:
        return jsonify({"errors": validation_errors}), 400

    # Обработка дефолтных значений для текстовых полей, если пришел null или пустая строка
    name = data.get("name")
    name = "Без имени" if name in (None, "") else str(name).strip()
    color = data.get("color")
    color = "" if color is None else str(color).strip()
    observed_time = data.get("observed_time")
    observed_time = "" if observed_time is None else str(observed_time).strip()

    row = db(
        """
        INSERT INTO animals (name, species, color, observed_time, latitude, longitude, photo_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            name,
            str(data["species"]).strip(),
            color,
            observed_time,
            data["latitude"],
            data["longitude"],
            data.get("photo_data"),
        ),
    )
    return jsonify(to_json(row)), 201


# === 4. Изменить существующую метку (PATCH) ===
@app.patch("/api/animals/<int:animal_id>")
@limiter.limit("1 per 10 seconds")
def update_animal(animal_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный или пустой JSON"}), 400

    # Фильтруем поля через белый список (защита от изменения системных полей вроде id или created_at)
    fields = {key: value for key, value in data.items() if key in EDITABLE_FIELDS}
    if not fields:
        return jsonify({"error": "Нет корректных полей для обновления"}), 400

    # Валидируем только те изменяемые данные, которые прислал клиент
    validation_errors = validate_animal_data(fields)
    if validation_errors:
        return jsonify({"errors": validation_errors}), 400

    # Обработка специфики null-значений для PATCH (чтобы не нарушить NOT NULL в БД)
    if "name" in fields and fields["name"] in (None, ""):
        fields["name"] = "Без имени"
    if "color" in fields and fields["color"] is None:
        fields["color"] = ""
    if "observed_time" in fields and fields["observed_time"] is None:
        fields["observed_time"] = ""

    # Динамическое и безопасное формирование SQL-запроса
    field_names = list(fields.keys())
    set_sql = ", ".join(f"{name} = %s" for name in field_names)
    params = tuple(fields[name] for name in field_names) + (animal_id,)

    row = db(f"UPDATE animals SET {set_sql} WHERE id = %s RETURNING *", params)
    if row is None:
        return jsonify({"error": "Метка не найдена"}), 404
    return jsonify(to_json(row))


# === 5. Удалить метку ===
@app.delete("/api/animals/<int:animal_id>")
@limiter.limit("1 per 10 seconds")
def delete_animal(animal_id):
    row = db("DELETE FROM animals WHERE id = %s RETURNING id", (animal_id,))
    if row is None:
        return jsonify({"error": "Метка не найдена"}), 404
    return "", 204


# === 6. Проверка здоровья сервиса (Healthcheck) ===
# Без лимитов rate-limiting, чтобы внутренние проверки Docker Healthcheck/K8s не блокировались
@app.get("/health")
@limiter.exempt
def health():
    try:
        # Проверяем доступность базы данных легковесным запросом
        db("SELECT 1", fetch="one")
        return jsonify({"status": "ok", "database": "ok"}), 200
    except psycopg.Error:
        return jsonify({"status": "error", "database": "unavailable"}), 503


# Перехват и красивое оформление ошибки превышения лимитов запросов (HTTP 429)
@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({
        "error": "Слишком много запросов",
        "message": "Пожалуйста, подождите. Допускается не более 1 запроса в 10 секунд с одного IP."
    }), 429


if __name__ == "__main__":
    # Сервер слушает на всех интерфейсах внутри Docker-контейнера на порту 5000
    app.run(host="0.0.0.0", port=5000)