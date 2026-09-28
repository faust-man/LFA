from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from .. import db, auth
from ..security import limiter, sanitize_text

bp = Blueprint("chats", __name__, url_prefix="/api/chats")


def _is_participant(chat: dict, user_id: int) -> bool:
    return user_id in (chat["initiator_id"], chat["owner_id"])


@bp.route("", methods=["GET"])
@jwt_required()
def list_chats():
    """Список чатов текущего пользователя (и как автора объявления, и как
    того, кто написал), с превью последнего сообщения — для экрана 'Мои чаты'."""
    user_id = int(get_jwt_identity())
    rows = db.fetch_all(
        """
        SELECT
            c.id, c.listing_id, c.initiator_id, c.owner_id, c.created_at,
            l.title AS listing_title, l.status AS listing_status,
            lm.content AS last_message, lm.created_at AS last_message_at
        FROM chats c
        JOIN listings l ON l.id = c.listing_id
        LEFT JOIN LATERAL (
            SELECT content, created_at FROM messages
             WHERE chat_id = c.id
             ORDER BY created_at DESC
             LIMIT 1
        ) lm ON TRUE
        WHERE c.initiator_id = %s OR c.owner_id = %s
        ORDER BY COALESCE(lm.created_at, c.created_at) DESC
        LIMIT 200
        """,
        (user_id, user_id),
    )
    for r in rows:
        r["created_at"] = r["created_at"].isoformat()
        if r["last_message_at"]:
            r["last_message_at"] = r["last_message_at"].isoformat()
    return jsonify(rows), 200


@bp.route("", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")
def start_chat():
    """Начать чат по объявлению — например, написать 'нашёл животное'."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or "listing_id" not in data:
        return jsonify({"error": "Нужно указать listing_id"}), 400

    try:
        listing_id = int(data["listing_id"])
    except (TypeError, ValueError):
        return jsonify({"error": "listing_id должен быть числом"}), 400

    listing = db.fetch_one(
        "SELECT id, user_id FROM listings WHERE id = %s AND is_active = TRUE", (listing_id,)
    )
    if not listing:
        return jsonify({"error": "Объявление не найдено"}), 404

    initiator_id = int(get_jwt_identity())
    if initiator_id == listing["user_id"]:
        return jsonify({"error": "Нельзя начать чат с самим собой"}), 400

    chat = db.fetch_one(
        "SELECT id FROM chats WHERE listing_id = %s AND initiator_id = %s",
        (listing["id"], initiator_id),
    )
    if not chat:
        chat = db.execute_returning(
            """
            INSERT INTO chats (listing_id, initiator_id, owner_id)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (listing["id"], initiator_id, listing["user_id"]),
        )

    first_message = data.get("message")
    if first_message:
        _send_message(chat["id"], initiator_id, first_message)

    return jsonify({"chat_id": chat["id"]}), 201


@bp.route("/<int:chat_id>/messages", methods=["GET"])
@jwt_required()
def get_messages(chat_id: int):
    chat = db.fetch_one("SELECT * FROM chats WHERE id = %s", (chat_id,))
    if not chat:
        return jsonify({"error": "Чат не найден"}), 404

    current_user_id = int(get_jwt_identity())
    if not _is_participant(chat, current_user_id):
        return jsonify({"error": "Недостаточно прав"}), 403

    messages = db.fetch_all(
        "SELECT id, sender_id, content, is_read, created_at FROM messages "
        "WHERE chat_id = %s ORDER BY created_at ASC LIMIT 500",
        (chat_id,),
    )
    for m in messages:
        m["created_at"] = m["created_at"].isoformat()

    # Отмечаем прочитанными сообщения собеседника — свои же сообщения не трогаем.
    db.execute(
        "UPDATE messages SET is_read = TRUE WHERE chat_id = %s AND sender_id != %s AND is_read = FALSE",
        (chat_id, current_user_id),
    )

    return jsonify(messages), 200


@bp.route("/<int:chat_id>/messages", methods=["POST"])
@jwt_required()
@limiter.limit("60 per hour")  # защита от спама в чатах
def post_message(chat_id: int):
    chat = db.fetch_one("SELECT * FROM chats WHERE id = %s", (chat_id,))
    if not chat:
        return jsonify({"error": "Чат не найден"}), 404

    current_user_id = int(get_jwt_identity())
    if not _is_participant(chat, current_user_id):
        return jsonify({"error": "Недостаточно прав"}), 403

    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not (data.get("content") or "").strip():
        return jsonify({"error": "Пустое сообщение"}), 400

    message = _send_message(chat_id, current_user_id, data["content"])
    return jsonify(message), 201


def _send_message(chat_id: int, sender_id: int, content: str) -> dict:
    clean_content = sanitize_text(content, 2000)
    message = db.execute_returning(
        """
        INSERT INTO messages (chat_id, sender_id, content)
        VALUES (%s, %s, %s)
        RETURNING id, sender_id, content, is_read, created_at
        """,
        (chat_id, sender_id, clean_content),
    )
    message["created_at"] = message["created_at"].isoformat()
    return message
