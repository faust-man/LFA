-- =====================================================================
-- Таблица «Замеченные животные»
-- Хранит все метки, которые пользователи ставят через кнопку «+».
-- =====================================================================
CREATE TABLE IF NOT EXISTS animals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name VARCHAR(100) NOT NULL DEFAULT 'Без имени',

    species VARCHAR(50) NOT NULL,

    color VARCHAR(100) NOT NULL DEFAULT '',

    observed_time VARCHAR(5) NOT NULL DEFAULT ''
        CHECK (observed_time = ''
               OR observed_time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),

    observed_date VARCHAR(10) NOT NULL DEFAULT ''
        CHECK (observed_date = ''
               OR observed_date ~ '^\d{2}\.\d{2}\.\d{4}$'),

    latitude DOUBLE PRECISION NOT NULL
        CHECK (latitude BETWEEN -90 AND 90),

    longitude DOUBLE PRECISION NOT NULL
        CHECK (longitude BETWEEN -180 AND 180),

    photo_data TEXT,

    behavior TEXT NOT NULL DEFAULT '',

    state TEXT NOT NULL DEFAULT '',

    ready BOOLEAN NOT NULL DEFAULT FALSE,

    contact TEXT NOT NULL DEFAULT '',

    address TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Обновление существующего volume без удаления сохранённых меток.
ALTER TABLE animals ADD COLUMN IF NOT EXISTS color VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS observed_time VARCHAR(5) NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS observed_date VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS photo_data TEXT;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS behavior TEXT NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS contact TEXT NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE animals ALTER COLUMN name SET DEFAULT 'Без имени';

CREATE INDEX IF NOT EXISTS idx_animals_species ON animals(species);

CREATE INDEX IF NOT EXISTS idx_animals_ready ON animals(ready) WHERE ready = TRUE;


-- =====================================================================
-- Таблица «Пропавшие животные»
-- Хранит объявления, созданные через кнопку «Потерял животное».
-- =====================================================================
CREATE TABLE IF NOT EXISTS lost_ads (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    nickname VARCHAR(100) NOT NULL,

    character TEXT NOT NULL,

    contact VARCHAR(200) NOT NULL,

    species VARCHAR(50) NOT NULL,

    color VARCHAR(100) NOT NULL DEFAULT '',

    lost_time VARCHAR(5) NOT NULL DEFAULT ''
        CHECK (lost_time = ''
               OR lost_time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),

    lost_date VARCHAR(10) NOT NULL DEFAULT ''
        CHECK (lost_date = ''
               OR lost_date ~ '^\d{2}\.\d{2}\.\d{4}$'),

    address TEXT NOT NULL DEFAULT '',

    latitude DOUBLE PRECISION
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),

    longitude DOUBLE PRECISION
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),

    photo_data TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lost_ads_species ON lost_ads(species);

CREATE INDEX IF NOT EXISTS idx_lost_ads_coords
    ON lost_ads(latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;



