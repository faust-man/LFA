"""Check the running stack; remove only records created by this check."""
import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4


def run(base_url):
    def request(path, method="GET", payload=None, expected=200):
        body = json.dumps(payload).encode() if payload is not None else None
        req = Request(base_url.rstrip("/") + path, data=body, method=method,
                      headers={"Content-Type": "application/json"})
        try:
            response = urlopen(req, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            content = response.read()
            assert response.status == expected, (method, path, response.status, content)
            if "application/json" in response.headers.get("Content-Type", ""):
                return json.loads(content)
            return content

    assert request("/health") == {"status": "ok", "database": "ok"}
    assert b"map" in request("/")
    script = request("/script.js")
    assert b'const API_BASE = ""' in script
    request("/style.css")
    created = []
    tag = "smoke-" + uuid4().hex[:12]
    animal_payload = {
        "name": tag, "species": "Кошка", "latitude": 55.75, "longitude": 37.61,
        "observed_time": "12:30", "observed_date": "06.10.2026",
        "behavior": "Спокойный", "state": "Здоров", "ready": True,
        "contact": "test", "address": "test", "photo_data": None,
    }
    try:
        animal = request("/api/animals", "POST", animal_payload, 201)
        path = f"/api/animals/{animal['id']}"
        created.append(path)
        assert request(path)["name"] == tag
        assert any(row["id"] == animal["id"] for row in request("/api/animals"))
        assert request(path, "PATCH", {"ready": False, "observed_date": "07.10.2026"})["ready"] is False
        for bad in ({"latitude": 91}, {"latitude": None}, {"ready": "false"}):
            request(path, "PATCH", bad, 400)
        for bad in ({"species": " "}, {"observed_time": "99:99"},
                    {"observed_date": "31.02.2026"}, {"longitude": "nan"}):
            request("/api/animals", "POST", {**animal_payload, **bad}, 400)
        ad = request("/api/lost_ads", "POST", {
            "nickname": tag, "character": "Спокойный", "contact": "test",
            "species": "Кошка", "lost_time": "12:30", "lost_date": "06.10.2026",
        }, 201)
        created.append(f"/api/lost_ads/{ad['id']}")
        assert ad["latitude"] is None
        assert any(row["id"] == ad["id"] for row in request("/api/lost_ads"))
        request("/api/lost_ads", "POST", {"species": "Кошка"}, 400)
        request("/api/animals", "POST", ["invalid"], 400)
    finally:
        for path in reversed(created):
            request(path, "DELETE", expected=204)
    request(f"/api/animals/{animal['id']}", expected=404)
    request(f"/api/lost_ads/{ad['id']}", "DELETE", expected=404)
    print("OK: health, static files, animal CRUD, lost ads, validation, cleanup")


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080")
