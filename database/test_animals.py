import datetime


VALID_PAYLOAD = {
    "title": "Пропал кот",
    "species": "cat",
    "latitude": 55.75,
    "longitude": 37.61,
}


def test_list_rejects_invalid_status_filter(client, auth_headers):
    resp = client.get("/api/animals?status=lost")  # допустимо только missing/found
    assert resp.status_code == 400


def test_list_rejects_non_numeric_bbox_param(client, auth_headers):
    resp = client.get("/api/animals?min_lat=not-a-number")
    assert resp.status_code == 400


def test_create_requires_auth(client, auth_headers):
    resp = client.post("/api/animals", json=VALID_PAYLOAD)
    assert resp.status_code == 401


def test_create_rejects_missing_fields(client, app, auth_headers):
    resp = client.post("/api/animals", json={"title": "x"}, headers=auth_headers())
    assert resp.status_code == 400


def test_create_rejects_species_empty_after_sanitizing(client, app, auth_headers):
    """Если после очистки от HTML/тегов вид животного оказывается пустой
    строкой, это должно быть ошибкой, а не пройти как валидное значение."""
    payload = {**VALID_PAYLOAD, "species": "<script></script>"}
    resp = client.post("/api/animals", json=payload, headers=auth_headers())
    assert resp.status_code == 400


def test_create_rejects_out_of_range_coordinates(client, app, auth_headers):
    payload = {**VALID_PAYLOAD, "latitude": 200}
    resp = client.post("/api/animals", json=payload, headers=auth_headers())
    assert resp.status_code == 400


def test_create_rejects_negative_reward(client, app, auth_headers):
    payload = {**VALID_PAYLOAD, "reward_amount": -100}
    resp = client.post("/api/animals", json=payload, headers=auth_headers())
    assert resp.status_code == 400


def test_create_rejects_non_positive_weight(client, app, auth_headers):
    payload = {**VALID_PAYLOAD, "weight_kg": 0}
    resp = client.post("/api/animals", json=payload, headers=auth_headers())
    assert resp.status_code == 400


def test_create_rejects_non_http_photo_url(client, app, auth_headers):
    """Ссылка не http(s) (например, javascript:) должна отклоняться — иначе
    фронтенд мог бы выполнить её при рендеринге ссылки/картинки (XSS)."""
    payload = {**VALID_PAYLOAD, "photo_url": "javascript:alert(1)"}
    resp = client.post("/api/animals", json=payload, headers=auth_headers())
    assert resp.status_code == 400


def test_create_success_returns_listing_id_not_animal_id(client, app, mock_db, auth_headers):
    """Регрессионный тест: раньше при слиянии словарей listing/animal id
    объявления перезаписывался id-шником животного (оба словаря содержат
    ключ 'id'). Проверяем, что в ответе действительно id объявления."""
    mock_db["execute_returning"].side_effect = [
        {  # INSERT INTO listings RETURNING ...
            "id": 42, "title": "Пропал кот", "description": None,
            "latitude": 55.75, "longitude": 37.61, "map_link": None,
            "status": "missing", "reward_amount": 0, "created_at": datetime.datetime.now(),
            "updated_at": datetime.datetime.now(), "found_at": None, "user_id": 1,
        },
        {  # INSERT INTO animals RETURNING ...
            "id": 999,  # намеренно другой id, чтобы поймать баг перезаписи
            "name": None, "species": "cat", "breed": None, "color": None,
            "size": None, "weight_kg": None, "fur_type": None, "eye_color": None,
            "photo_url": None,
        },
    ]

    resp = client.post("/api/animals", json=VALID_PAYLOAD, headers=auth_headers())

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["id"] == 42          # id объявления, НЕ 999
    assert body["animal"]["id"] == 999  # id животного — отдельно, во вложенном объекте
