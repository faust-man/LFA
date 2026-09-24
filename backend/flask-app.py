import os

import psycopg
from psycopg.rows import dict_row
from flask import Flask, jsonify, request

app = Flask(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]

animals = [
    {"id": 1, "name": "Барсик", "species": "cat"},
    {"id": 2, "name": "Шарик", "species": "dog"}
]

@app.route("/api/animals", methods = ["GET"])
def get_animals():
    return jsonify(animals), 200

@app.route("/api/animals/<int:animal_id>", methods = ["GET"])
def get_animal(animal_id):
    for animal in animals:
        if animal["id"] == animal_id:
            return jsonify(animal), 200

    return jsonify({"error": "Not found"}), 404

@app.route("/api/animals", methods = ["POST"])
def create_animal():
    data = request.get_json()

    if isinstance(data, dict):
        return jsonify({"error": "Invalid JSON"}), 400

    required = ("name", "species", "latitude", "longitude")

    if any(field not in data for field in required):
        return jsonify({"error": "Missing fields"}), 400

    animal = {
        "id": max((a["id"] for a in animals), default=0) + 1,
        "name": data["name"],
        "species": data["species"],
        "latitude": data["latitude"],
        "longitude": data["longitude"]
    }

    animals.append(animal)

    return jsonify(animal), 201

@app.route("/api/animals/<int:animal_id>", methods=["DELETE"])
def delete_animal(animal_id):
    for animal in animals:
        if animal["id"] == animal_id:
            animals.remove(animal)
            return "", 204

    return jsonify({"error": "Not found"}), 404

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    app.run(host = "0.0.0.0", port = 5000)