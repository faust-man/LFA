def test_list_chats_requires_auth(client):
    resp = client.get("/api/chats")
    assert resp.status_code == 401


def test_start_chat_rejects_non_integer_listing_id(client, app, auth_headers):
    resp = client.post("/api/chats", json={"listing_id": "not-a-number"}, headers=auth_headers())
    assert resp.status_code == 400


def test_start_chat_rejects_missing_listing(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].return_value = None
    resp = client.post("/api/chats", json={"listing_id": 999}, headers=auth_headers())
    assert resp.status_code == 404


def test_start_chat_rejects_chatting_with_self(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].return_value = {"id": 5, "user_id": 1}  # owner == текущий пользователь (id=1)
    resp = client.post("/api/chats", json={"listing_id": 5}, headers=auth_headers(1))
    assert resp.status_code == 400


def test_get_messages_forbidden_for_non_participant(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].return_value = {"id": 5, "initiator_id": 2, "owner_id": 3}
    resp = client.get("/api/chats/5/messages", headers=auth_headers(1))
    assert resp.status_code == 403


def test_post_empty_message_rejected(client, app, mock_db, auth_headers):
    mock_db["fetch_one"].return_value = {"id": 5, "initiator_id": 1, "owner_id": 3}
    resp = client.post("/api/chats/5/messages", json={"content": "   "}, headers=auth_headers(1))
    assert resp.status_code == 400
