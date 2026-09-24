CREATE TABLE IF NOT EXISTS animals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    species VARCHAR(50) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_latitude
        CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT valid_longitude
        CHECK (longitude BETWEEN -180 AND 180)
);

INSERT INTO animals
    (name, species, latitude, longitude)
VALUES
    ('Барсик', 'cat', 55.75, 37.61),
    ('Шарик', 'dog', 55.80, 37.70),
    ('Мурка', 'cat', 55.76, 37.62);