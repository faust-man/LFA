from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from .. import db

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@bp.route("", methods=["GET"])
@jwt_required()
def list_notifications():
    """Уведомления текущего пользователя (например, 'животное нашлось').
    ?unread=true — только непрочитанные."""
    user_id = int(get_jwt_identity())
    only_unread = request.args.get("unread", "").lower() == "true"

    query = "SELECT id, listing_id, type, message, is_read, created_at FROM notifications WHERE user_id = %s"
    params = [user_id]
    if only_unread:
        query += " AND is_read = FALSE"
    query += " ORDER BY created_at DESC LIMIT 200"

    rows = db.fetch_all(query, tuple(params))
    for r in rows:
        r["created_at"] = r["created_at"].isoformat()
    return jsonify(rows), 200


@bp.route("/<int:notification_id>/read", methods=["PATCH"])
@jwt_required()
def mark_read(notification_id: int):
    user_id = int(get_jwt_identity())
    owner = db.fetch_one("SELECT user_id FROM notifications WHERE id = %s", (notification_id,))
    if not owner:
        return jsonify({"error": "Не найдено"}), 404
    if owner["user_id"] != user_id:
        return jsonify({"error": "Недостаточно прав"}), 403

    db.execute("UPDATE notifications SET is_read = TRUE WHERE id = %s", (notification_id,))
    return jsonify({"message": "Отмечено как прочитанное"}), 200


@bp.route("/read-all", methods=["PATCH"])
@jwt_required()
def mark_all_read():
    user_id = int(get_jwt_identity())
    db.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = %s AND is_read = FALSE", (user_id,))
    return jsonify({"message": "Все уведомления отмечены как прочитанные"}), 200
