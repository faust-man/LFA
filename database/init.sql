CREATE TABLE IF NOT EXISTS animals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL DEFAULT 'Без имени',
    species VARCHAR(50) NOT NULL,
    color VARCHAR(100) NOT NULL DEFAULT '',
    observed_time VARCHAR(5) NOT NULL DEFAULT '',
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    photo_data TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- These ALTER statements make the project compatible with the old training volume,
-- where animals had only name/species/coordinates.
ALTER TABLE animals ADD COLUMN IF NOT EXISTS color VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS observed_time VARCHAR(5) NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS photo_data TEXT;
ALTER TABLE animals ALTER COLUMN name SET DEFAULT 'Без имени';

INSERT INTO animals (name, species, color, observed_time, latitude, longitude)
SELECT 'Барсик', 'Кошка', 'серый', '12:30', 55.75, 37.61
WHERE NOT EXISTS (SELECT 1 FROM animals);
