import os
import unittest
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


if __name__ == "__main__":
    unittest.main()
