import os

import psycopg
from flask import Flask, jsonify, request
from psycopg.rows import dict_row

app = Flask(__name__)
DATABASE_URL = os.environ["DATABASE_URL"]


def query_one(sql, params=()):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def query_all(sql, params=()):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def animal_json(row):
    if row is None:
        return None
    animal = dict(row)
    if animal.get("created_at"):
        animal["created_at"] = animal["created_at"].isoformat()
    return animal


@app.get("/api/animals")
def get_animals():
    rows = query_all("SELECT * FROM animals ORDER BY id")
    return jsonify([animal_json(row) for row in rows])


@app.get("/api/animals/<int:animal_id>")
def get_animal(animal_id):
    row = query_one("SELECT * FROM animals WHERE id = %s", (animal_id,))
    if row is None:
        return jsonify({"error": "Animal not found"}), 404
    return jsonify(animal_json(row))


@app.post("/api/animals")
def create_animal():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON"}), 400

    required = ("name", "species", "latitude", "longitude")
    if any(field not in data for field in required):
        return jsonify({"error": "Missing fields"}), 400

    try:
        latitude = float(data["latitude"])
        longitude = float(data["longitude"])
    except (TypeError, ValueError):
        return jsonify({"error": "Coordinates must be numbers"}), 400

    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return jsonify({"error": "Coordinates are out of range"}), 400

    row = query_one(
        """
        INSERT INTO animals (name, species, latitude, longitude)
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """,
        (data["name"], data["species"], latitude, longitude),
    )
    return jsonify(animal_json(row)), 201


@app.patch("/api/animals/<int:animal_id>")
def update_animal(animal_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON"}), 400

    allowed = {"name", "species", "latitude", "longitude"}
    fields = {key: value for key, value in data.items() if key in allowed}
    if not fields:
        return jsonify({"error": "Nothing to update"}), 400

    if "latitude" in fields:
        try:
            fields["latitude"] = float(fields["latitude"])
        except (TypeError, ValueError):
            return jsonify({"error": "Latitude must be a number"}), 400
        if not -90 <= fields["latitude"] <= 90:
            return jsonify({"error": "Latitude is out of range"}), 400

    if "longitude" in fields:
        try:
            fields["longitude"] = float(fields["longitude"])
        except (TypeError, ValueError):
            return jsonify({"error": "Longitude must be a number"}), 400
        if not -180 <= fields["longitude"] <= 180:
            return jsonify({"error": "Longitude is out of range"}), 400

    set_sql = ", ".join(f"{name} = %s" for name in fields)
    params = tuple(fields.values()) + (animal_id,)
    row = query_one(
        f"UPDATE animals SET {set_sql} WHERE id = %s RETURNING *",
        params,
    )

    if row is None:
        return jsonify({"error": "Animal not found"}), 404
    return jsonify(animal_json(row))


@app.delete("/api/animals/<int:animal_id>")
def delete_animal(animal_id):
    row = query_one(
        "DELETE FROM animals WHERE id = %s RETURNING id",
        (animal_id,),
    )
    if row is None:
        return jsonify({"error": "Animal not found"}), 404
    return "", 204


@app.get("/health")
def health():
    try:
        query_one("SELECT 1")
        return jsonify({"status": "ok", "database": "ok"})
    except psycopg.Error:
        return jsonify({"status": "error", "database": "unavailable"}), 503


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
