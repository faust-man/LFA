-- =====================================================================
-- Схема БД: приложение поиска пропавших животных
-- PostgreSQL 14+
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- на будущее, для gen_random_uuid() и т.п.

-- ---------------------------------------------------------------------
-- Пользователи ("база пользователей": логины/пароли)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username               VARCHAR(50)  NOT NULL UNIQUE,
    email                  VARCHAR(255) NOT NULL UNIQUE,
    phone                  VARCHAR(20),
    password_hash          VARCHAR(255) NOT NULL,   -- хэш (werkzeug: scrypt), пароль в открытом виде НИКОГДА не хранится
    is_active              BOOLEAN      NOT NULL DEFAULT TRUE,
    failed_login_attempts  INT          NOT NULL DEFAULT 0,
    locked_until           TIMESTAMPTZ,             -- временная блокировка после брутфорс-попыток
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ---------------------------------------------------------------------
-- Объявления ("листинги") — то, что отображается на карте.
-- Геопозиция объявления НЕ связана с профилем пользователя: пользователь
-- может опубликовать объявление в другой точке (например, где реально
-- пропало животное), не меняя данные своего аккаунта.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(150) NOT NULL,
    description    TEXT,
    latitude       DOUBLE PRECISION NOT NULL,
    longitude      DOUBLE PRECISION NOT NULL,
    ip_address     INET,                 -- ip, с которого опубликовано объявление
    map_link       TEXT,                 -- ссылка на карту (например, для шаринга)
    status         VARCHAR(20) NOT NULL DEFAULT 'missing'
                       CHECK (status IN ('missing', 'found')),
    reward_amount  NUMERIC(12,2) NOT NULL DEFAULT 0
                       CHECK (reward_amount >= 0),  -- 0..без ограничений сверху
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,   -- для "мягкого" удаления
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    found_at       TIMESTAMPTZ,

    CONSTRAINT valid_latitude  CHECK (latitude  BETWEEN -90 AND 90),
    CONSTRAINT valid_longitude CHECK (longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_listings_user     ON listings (user_id);
CREATE INDEX IF NOT EXISTS idx_listings_status   ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings (latitude, longitude);

-- ---------------------------------------------------------------------
-- Животные — характеристики, привязаны 1:1 к объявлению
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS animals (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    listing_id   BIGINT NOT NULL UNIQUE REFERENCES listings(id) ON DELETE CASCADE,
    name         VARCHAR(100),
    species      VARCHAR(50)  NOT NULL,             -- хомяк, собака, кот и т.д.
    breed        VARCHAR(100),                      -- порода
    color        VARCHAR(100),                      -- окрас
    size         VARCHAR(20)
                     CHECK (size IN ('small', 'medium', 'large')),
    weight_kg    NUMERIC(5,2) CHECK (weight_kg > 0),
    fur_type     VARCHAR(50),                       -- тип шерсти
    eye_color    VARCHAR(50),                       -- цвет глаз
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_animals_species ON animals (species);

-- Миграция для БД, созданных до появления отдельной таблицы photos ниже —
-- на новых развёртываниях столбец photo_url никогда не создаётся, поэтому
-- эта строка безопасна и идемпотентна.
ALTER TABLE animals DROP COLUMN IF EXISTS photo_url;

-- ---------------------------------------------------------------------
-- Фотографии объявления (несколько на объявление). Сами файлы хранятся
-- на диске/в облаке (см. backend/storage.py) — здесь только метаданные
-- и публичные URL уже обработанных версий (см. backend/media.py):
-- автоматическая конвертация в WebP, полноразмерная версия (до 1920×1080,
-- ~150-200 КБ) и миниатюра (300×300, ~20-30 КБ).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photos (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    listing_id        BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    uploaded_by       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_backend   VARCHAR(10) NOT NULL DEFAULT 'local'
                          CHECK (storage_backend IN ('local', 's3')),
    full_key          VARCHAR(500) NOT NULL,   -- ключ/путь файла в хранилище (для удаления)
    full_url          TEXT NOT NULL,           -- публичный URL полноразмерной версии
    full_width        SMALLINT NOT NULL,
    full_height       SMALLINT NOT NULL,
    full_size_bytes   INTEGER NOT NULL,
    thumb_key         VARCHAR(500) NOT NULL,
    thumb_url         TEXT NOT NULL,           -- публичный URL миниатюры
    thumb_size_bytes  INTEGER NOT NULL,
    is_primary        BOOLEAN NOT NULL DEFAULT FALSE,  -- главное фото объявления
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Небольшой запас сверх целевого веса из ТЗ (150-200 КБ / 20-30 КБ) —
    -- на случай, если исходник экстремально детализирован и уложиться
    -- точно в 200/30 КБ без заметной потери качества не вышло.
    CONSTRAINT reasonable_full_size  CHECK (full_size_bytes  <= 400 * 1024),
    CONSTRAINT reasonable_thumb_size CHECK (thumb_size_bytes <= 60  * 1024)
);

CREATE INDEX IF NOT EXISTS idx_photos_listing ON photos (listing_id, is_primary DESC, created_at);

-- ---------------------------------------------------------------------
-- Чаты по конкретному объявлению (например, "нашёл животное, пишу владельцу")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chats (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    listing_id    BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    initiator_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- тот, кто нашёл/написал
    owner_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- автор объявления
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (listing_id, initiator_id)
);

CREATE INDEX IF NOT EXISTS idx_chats_listing ON chats (listing_id);

CREATE TABLE IF NOT EXISTS messages (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id     BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, created_at);

-- ---------------------------------------------------------------------
-- Уведомления (например: "животное из объявления, на которое вы
-- подписаны/которое ищете, нашлось")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id  BIGINT REFERENCES listings(id) ON DELETE CASCADE,
    type        VARCHAR(30) NOT NULL,      -- 'animal_found', 'new_message', ...
    message     TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read);

-- ---------------------------------------------------------------------
-- Журнал аудита (для безопасности: кто и что делал — логины, изменения
-- объявлений, ошибки авторизации и т.д.)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,     -- 'login_success', 'login_failed', 'listing_created', ...
    ip_address  INET,
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id, created_at);

-- ---------------------------------------------------------------------
-- Триггер: автообновление updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_listings_updated_at ON listings;
CREATE TRIGGER trg_listings_updated_at
    BEFORE UPDATE ON listings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Тестовые данные
-- ---------------------------------------------------------------------
INSERT INTO users (username, email, password_hash)
VALUES ('demo_user', 'demo@example.com', 'REPLACE_WITH_REAL_BCRYPT_HASH')
ON CONFLICT DO NOTHING;

INSERT INTO listings (user_id, title, description, latitude, longitude, status, reward_amount)
SELECT id, 'Пропал кот Барсик', 'Ушёл из дома вечером, откликается на имя', 55.75, 37.61, 'missing', 2000
FROM users WHERE username = 'demo_user'
ON CONFLICT DO NOTHING;

INSERT INTO animals (listing_id, name, species, breed, color, size, weight_kg, fur_type, eye_color)
SELECT id, 'Барсик', 'cat', 'дворовая', 'рыжий', 'medium', 4.5, 'короткая', 'зелёные'
FROM listings WHERE title = 'Пропал кот Барсик'
ON CONFLICT DO NOTHING;
