import os
import unittest
import base64
from unittest.mock import patch

os.environ["REDIS_URL"] = "memory://"
from backend import app as backend


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()
        backend.limiter.reset()

    def test_invalid_input_never_reaches_database(self):
        base = {"species": "Кошка", "latitude": 55.75, "longitude": 37.61}
        with patch.object(backend, "db") as query:
            for invalid in ({"latitude": True}, {"latitude": "nan"},
                            {"longitude": 181}, {"species": " "},
                            {"color": {}}, {"ready": "false"},
                            {"observed_date": "31.02.2026"},
                            {"observed_time": "12:30\n"}):
                with self.subTest(invalid=invalid):
                    response = self.client.post("/api/animals", json={**base, **invalid})
                    self.assertEqual(response.status_code, 400)
            query.assert_not_called()

    def test_patch_rejects_null_coordinates(self):
        with patch.object(backend, "db") as query:
            self.assertEqual(self.client.patch("/api/animals/1", json={"latitude": None}).status_code, 400)
            query.assert_not_called()

    def test_required_lost_ad_text(self):
        with patch.object(backend, "db") as query:
            response = self.client.post("/api/lost_ads", json={
                "nickname": " ", "character": "test", "contact": "test", "species": "Кошка",
            })
            self.assertEqual(response.status_code, 400)
            query.assert_not_called()

    def test_health_checks_schema(self):
        with patch.object(backend, "db", side_effect=backend.psycopg.errors.UndefinedTable()):
            response = self.client.get("/health")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json["database"], "unavailable")

    def test_database_errors_return_json(self):
        with patch.object(backend, "db", side_effect=backend.psycopg.OperationalError()):
            response = self.client.get("/api/animals")
            self.assertEqual(response.status_code, 503)
            self.assertIn("error", response.json)

    def test_rate_limit_and_exempt_health(self):
        with patch.object(backend, "db", return_value=[]):
            for _ in range(30):
                self.assertEqual(self.client.get("/api/animals").status_code, 200)
            self.assertEqual(self.client.get("/api/animals").status_code, 429)
            self.assertEqual(self.client.get("/health").status_code, 200)

    def test_rate_limit_is_per_ip_and_handler(self):
        with patch.object(backend, "db", return_value=[]):
            for _ in range(30):
                self.assertEqual(self.client.get("/api/animals", environ_overrides={"REMOTE_ADDR": "192.0.2.1"}).status_code, 200)
            self.assertEqual(self.client.get("/api/animals", environ_overrides={"REMOTE_ADDR": "192.0.2.1"}).status_code, 429)
            self.assertEqual(self.client.get("/api/animals", environ_overrides={"REMOTE_ADDR": "192.0.2.2"}).status_code, 200)
            self.assertEqual(self.client.get("/api/lost_ads", environ_overrides={"REMOTE_ADDR": "192.0.2.1"}).status_code, 200)

    def test_proxy_ip_used_for_limit(self):
        with patch.object(backend, "db", return_value=[]):
            for _ in range(30):
                self.assertEqual(self.client.get("/api/animals", headers={"X-Forwarded-For": "192.0.2.3"}).status_code, 200)
            self.assertEqual(self.client.get("/api/animals", headers={"X-Forwarded-For": "192.0.2.3"}).status_code, 429)
            self.assertEqual(self.client.get("/api/animals", headers={"X-Forwarded-For": "192.0.2.4"}).status_code, 200)

    def test_photo_size_boundary(self):
        for size, expected in ((backend.MAX_PHOTO_BYTES, 201), (backend.MAX_PHOTO_BYTES + 1, 413)):
            photo = "data:image/jpeg;base64," + base64.b64encode(b"x" * size).decode()
            with self.subTest(size=size), patch.object(backend, "db", return_value={"id": 1}) as query:
                response = self.client.post("/api/animals", json={"species": "Кошка", "latitude": 0, "longitude": 0, "photo_data": photo})
                self.assertEqual(response.status_code, expected)
                if expected == 413:
                    query.assert_not_called()

    def test_invalid_photo_and_total_request_size(self):
        with patch.object(backend, "db") as query:
            for photo in ("data:image/png;base64,invalid!", "https://example.com/photo.jpg"):
                self.assertEqual(self.client.post("/api/animals", json={"species": "Кошка", "latitude": 0, "longitude": 0, "photo_data": photo}).status_code, 400)
            response = self.client.post("/api/animals", data=b"x" * (8 * 1024 * 1024 + 1), content_type="application/json")
            self.assertEqual(response.status_code, 413)
            self.assertIn("error", response.json)
            query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
