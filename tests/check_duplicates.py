"""Integration check against Docker API; delete only the records created here."""
import base64
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4


def run(base):
    created = set()

    def request(path, method="POST", payload=None):
        req = Request(base.rstrip("/") + path, method=method,
                      data=json.dumps(payload).encode() if payload is not None else None,
                      headers={"Content-Type": "application/json"})
        try:
            response = urlopen(req, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read()) if response.status != 204 else None

    tag = "duplicate-check-" + uuid4().hex
    animal = {"name": tag, "species": "Кошка", "latitude": 55.75, "longitude": 37.61}
    ad = {"nickname": tag, "character": "Спокойный", "contact": "test", "species": "Кошка"}
    try:
        for path, payload in (("/api/animals", animal), ("/api/lost_ads", ad)):
            with ThreadPoolExecutor(max_workers=6) as pool:
                results = list(pool.map(lambda _: request(path, payload=payload), range(6)))
            for status, body in results:
                if status == 201:
                    created.add(f"{path}/{body['id']}")
            assert sorted(status for status, _ in results) == [201, 409, 409, 409, 409, 409], [(status, body.get("error")) for status, body in results]
            original = next(body for status, body in results if status == 201)
            assert all(body["existing_id"] == original["id"] for status, body in results if status == 409)
            # Explicit defaults, trimmed required text and numeric strings match stored data.
            equivalent = {**payload, "species": " Кошка ", "color": "", "photo_data": None}
            if path == "/api/animals":
                equivalent.update(latitude="55.75", longitude="37.61", ready=False)
            assert request(path, payload=equivalent)[0] == 409
            status, different = request(path, payload={**payload, "color": "Рыжий"})
            if status == 201:
                created.add(f"{path}/{different['id']}")
            assert status == 201, (status, different.get("error"))
            if path == "/api/animals":
                assert request(f"{path}/{different['id']}", "PATCH", {"color": ""})[0] == 409
                assert request(f"{path}/{different['id']}", "PATCH", {"color": "Рыжий"})[0] == 200

        oversized = "data:image/jpeg;base64," + base64.b64encode(b"x" * (5 * 1024 * 1024 + 1)).decode()
        for path, payload in (("/api/animals", animal), ("/api/lost_ads", ad)):
            assert request(path, payload={**payload, "photo_data": oversized})[0] == 413
        animal_path = next(path for path in created if path.startswith("/api/animals/"))
        assert request(animal_path, "PATCH", {"photo_data": oversized})[0] == 413
        assert request("/api/animals", payload={**animal, "address": "x" * (8 * 1024 * 1024)})[0] == 413
        print("OK: concurrent duplicates, normalized defaults, distinct records, PATCH, photo limits")
    finally:
        for path in created:
            assert request(path, "DELETE")[0] == 204


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "http://nginx")
