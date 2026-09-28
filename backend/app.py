import logging

from flask import Flask, jsonify, send_from_directory
from flask_jwt_extended import JWTManager

from .config import Config
from . import db
from .security import init_security, is_token_revoked
from .storage import init_storage
from .routes import auth_routes, animals_routes, chats_routes, notifications_routes, photos_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app(config_overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        # Нужно применить ДО db.init_pool/init_security — например,
        # тестам важно выставить DEBUG/RATELIMIT_ENABLED заранее: иначе
        # Talisman и Flask-Limiter уже зафиксируют старые значения при
        # инициализации ниже.
        app.config.update(config_overrides)

    # --- БД ---
    db.init_pool(app.config["DATABASE_URL"])

    # --- Хранилище фотографий (диск или S3-совместимое облако) ---
    init_storage(app)

    # --- WAF-подобные заголовки, CORS, rate limiting, Redis для blocklist ---
    # (вызывается до JWTManager, т.к. настраивает app.config["REDIS_URL"]-клиента,
    # который использует загрузчик чёрного списка ниже)
    init_security(app)

    # --- Auth / JWT ---
    jwt = JWTManager(app)

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(_jwt_header, jwt_payload):
        # Проверка отозванных токенов (logout) — см. security.revoke_token
        return is_token_revoked(jwt_payload["jti"])

    # --- Роуты ---
    app.register_blueprint(auth_routes.bp)
    app.register_blueprint(animals_routes.bp)
    app.register_blueprint(chats_routes.bp)
    app.register_blueprint(notifications_routes.bp)
    app.register_blueprint(photos_routes.bp)

    if app.config["STORAGE_BACKEND"] == "local":
        # Раздача сохранённых фото при локальном хранилище. При STORAGE_BACKEND=s3
        # этот роут не регистрируется — файлы отдаются напрямую из облака/CDN.
        @app.route("/media/<path:filename>")
        def serve_media(filename):
            response = send_from_directory(app.config["LOCAL_UPLOAD_DIR"], filename)
            # Ключи содержат случайный uuid и не переиспользуются — можно долго кэшировать.
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return response

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    # --- Единообразная обработка ошибок: никогда не отдаём наружу
    # стек-трейс или детали исключения — это защита от утечки
    # информации об инфраструктуре ---
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"error": "Не найдено"}), 404

    @app.errorhandler(429)
    def rate_limited(_e):
        return jsonify({"error": "Слишком много запросов, попробуйте позже"}), 429

    @app.errorhandler(413)
    def payload_too_large(_e):
        return jsonify({"error": "Файл слишком большой"}), 413

    @app.errorhandler(500)
    def server_error(e):
        logger.exception("Внутренняя ошибка сервера")
        return jsonify({"error": "Внутренняя ошибка сервера"}), 500

    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
