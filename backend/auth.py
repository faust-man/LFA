import re
from datetime import datetime, timezone

from flask import current_app
from werkzeug.security import generate_password_hash, check_password_hash

from . import db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Разрешаем буквы (в т.ч. кириллицу), цифры, "_", "." и "-" — запрещаем
# пробелы, теги и спецсимволы, чтобы имя нельзя было использовать для
# XSS/спуфинга там, где оно показывается другим пользователям (чаты, объявления).
USERNAME_RE = re.compile(r"^[\w.\-]+$", re.UNICODE)

# Хэш фиктивного пароля — используется, когда пользователь с таким email не
# найден, чтобы всё равно "потратить" время на проверку хэша: без этого
# ответ на несуществующий email приходил бы заметно быстрее, чем на
# существующий email с неверным паролем, и это позволяло бы через замер
# времени ответа перебором узнавать зарегистрированные email (timing-атака /
# user enumeration).
DUMMY_PASSWORD_HASH = generate_password_hash("dummy-password-for-constant-time-check")


def hash_password(raw_password: str) -> str:
    # werkzeug использует scrypt с солью — пароль в открытом виде
    # никогда не сохраняется и не логируется.
    return generate_password_hash(raw_password)


def verify_password(raw_password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, raw_password)


def validate_password_strength(raw_password: str) -> str | None:
    """Возвращает текст ошибки или None, если пароль достаточно сильный."""
    min_len = current_app.config["PASSWORD_MIN_LENGTH"]
    max_len = current_app.config["PASSWORD_MAX_LENGTH"]
    if len(raw_password) < min_len:
        return f"Пароль должен быть не короче {min_len} символов"
    if len(raw_password) > max_len:
        # Ограничение сверху — защита от DoS через хэширование гигантских
        # строк (алгоритм хэширования пароля намеренно медленный).
        return f"Пароль должен быть не длиннее {max_len} символов"
    if not re.search(r"[A-Za-zА-Яа-я]", raw_password):
        return "Пароль должен содержать буквы"
    if not re.search(r"\d", raw_password):
        return "Пароль должен содержать цифры"
    return None


def validate_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email)) and len(email) <= 255


def validate_username(username: str) -> bool:
    return bool(USERNAME_RE.match(username))


def is_account_locked(user: dict) -> bool:
    locked_until = user.get("locked_until")
    if not locked_until:
        return False
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    return locked_until > datetime.now(timezone.utc)


def register_failed_login(user_id: int) -> None:
    max_attempts = current_app.config["MAX_FAILED_LOGIN_ATTEMPTS"]
    lock_minutes = current_app.config["ACCOUNT_LOCK_MINUTES"]

    db.execute(
        """
        UPDATE users
           SET failed_login_attempts = failed_login_attempts + 1,
               locked_until = CASE
                   WHEN failed_login_attempts + 1 >= %s
                       THEN NOW() + (%s || ' minutes')::interval
                   ELSE locked_until
               END
         WHERE id = %s
        """,
        (max_attempts, lock_minutes, user_id),
    )


def reset_failed_login(user_id: int) -> None:
    db.execute(
        """
        UPDATE users
           SET failed_login_attempts = 0, locked_until = NULL
         WHERE id = %s
        """,
        (user_id,),
    )


def log_audit(user_id: int | None, action: str, ip_address: str | None, details: dict | None = None) -> None:
    import json

    db.execute(
        """
        INSERT INTO audit_log (user_id, action, ip_address, details)
        VALUES (%s, %s, %s, %s)
        """,
        (user_id, action, ip_address, json.dumps(details or {})),
    )
