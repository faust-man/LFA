from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from .. import db, auth
from ..security import limiter, revoke_token

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.route("/register", methods=["POST"])
@limiter.limit("10 per hour")  # защита от массовой регистрации ботами
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400

    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not username or len(username) < 3 or len(username) > 50:
        return jsonify({"error": "Имя пользователя должно быть от 3 до 50 символов"}), 400
    if not auth.validate_username(username):
        return jsonify({"error": "Имя пользователя может содержать только буквы, цифры, '_', '.' и '-'"}), 400
    if not auth.validate_email(email):
        return jsonify({"error": "Некорректный email"}), 400

    password_error = auth.validate_password_strength(password)
    if password_error:
        return jsonify({"error": password_error}), 400

    existing = db.fetch_one(
        "SELECT id FROM users WHERE email = %s OR username = %s", (email, username)
    )
    if existing:
        # Не уточняем, что именно занято — email или логин: это защита
        # от перебора существующих аккаунтов (user enumeration).
        return jsonify({"error": "Пользователь с такими данными уже существует"}), 409

    password_hash = auth.hash_password(password)
    user = db.execute_returning(
        """
        INSERT INTO users (username, email, password_hash)
        VALUES (%s, %s, %s)
        RETURNING id, username, email, created_at
        """,
        (username, email, password_hash),
    )
    auth.log_audit(user["id"], "register", request.remote_addr)

    return jsonify(user), 201


@bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")  # ключевая защита от брутфорса пароля
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Некорректный JSON"}), 400

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = db.fetch_one("SELECT * FROM users WHERE email = %s", (email,))

    # Единый ответ и для "нет такого email", и для "неверный пароль" —
    # чтобы не раскрывать, какие email зарегистрированы.
    generic_error = jsonify({"error": "Неверный email или пароль"}), 401

    if not user or not user["is_active"]:
        # Всё равно выполняем проверку хэша (против фиктивного хэша) —
        # иначе ответ для несуществующего email приходил бы быстрее, чем
        # для существующего с неверным паролем, что раскрывало бы по времени
        # ответа, какие email зарегистрированы (timing-атака).
        auth.verify_password(password, auth.DUMMY_PASSWORD_HASH)
        auth.log_audit(None, "login_failed_unknown_user", request.remote_addr, {"email": email})
        return generic_error

    if auth.is_account_locked(user):
        auth.log_audit(user["id"], "login_blocked_locked", request.remote_addr)
        return jsonify({"error": "Аккаунт временно заблокирован из-за подозрительной активности"}), 423

    if not auth.verify_password(password, user["password_hash"]):
        auth.register_failed_login(user["id"])
        auth.log_audit(user["id"], "login_failed_bad_password", request.remote_addr)
        return generic_error

    auth.reset_failed_login(user["id"])
    auth.log_audit(user["id"], "login_success", request.remote_addr)

    identity = str(user["id"])
    return jsonify({
        "access_token": create_access_token(identity=identity),
        "refresh_token": create_refresh_token(identity=identity),
        "user": {"id": user["id"], "username": user["username"], "email": user["email"]},
    }), 200


@bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    return jsonify({"access_token": create_access_token(identity=identity)}), 200


@bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Отзывает текущий access-токен немедленно (а не по истечении его
    срока действия) — важно, например, при выходе с публичного устройства.
    Если клиент передал в теле refresh_token, отзываем и его — иначе им
    можно было бы и дальше получать новые access-токены после выхода."""
    token = get_jwt()
    now_ts = int(datetime.now(timezone.utc).timestamp())
    revoke_token(token["jti"], expires_in_seconds=token["exp"] - now_ts)

    data = request.get_json(silent=True) or {}
    refresh_token = data.get("refresh_token")
    if refresh_token:
        try:
            decoded = decode_token(refresh_token)
            revoke_token(decoded["jti"], expires_in_seconds=decoded["exp"] - now_ts)
        except Exception:
            pass  # невалидный/уже просроченный refresh-токен — отзывать нечего

    auth.log_audit(int(get_jwt_identity()), "logout", request.remote_addr)
    return jsonify({"message": "Выход выполнен"}), 200
