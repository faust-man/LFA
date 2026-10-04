-- Таблица меток животных на интерактивной карте
CREATE TABLE IF NOT EXISTS animals (
    -- Автоматически инкрементируемый первичный ключ. GENERATED ALWAYS гарантирует невозможность ручной вставки ID
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Имя животного. Защищено от NULL, имеет значение по умолчанию
    name VARCHAR(100) NOT NULL DEFAULT 'Без имени',
    
    -- Вид животного (например: Cat, Dog, Bird) — обязательное поле
    species VARCHAR(50) NOT NULL,
    
    -- Цвет или приметы животного
    color VARCHAR(100) NOT NULL DEFAULT '',
    
    -- Время наблюдения. Должно быть пустым, либо строго соответствовать 24-часовому формату ЧЧ:ММ
    observed_time VARCHAR(5) NOT NULL DEFAULT '' 
                   CHECK (observed_time = '' OR observed_time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
    
    -- Географическая широта. Ограничена валидными международными стандартами от -90 до 90 градусов
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    
    -- Географическая долгота. Ограничена валидными международными стандартами от -180 до 180 градусов
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    
    -- Текстовое поле для хранения сырого изображения в формате Base64
    photo_data TEXT,
    
    -- Дата и время создания записи в БД с автоматическим учетом таймзоны (серверное время)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индекс для ускорения фильтрации и поиска меток по конкретному виду животного
CREATE INDEX IF NOT EXISTS idx_animals_species ON animals(species);

-- Безопасная атомарная инициализация базы данных первоначальными демонстрационными данными.
-- Запись вставится строго один раз и только тогда, когда таблица абсолютно пустая.
INSERT INTO animals (name, species, color, observed_time, latitude, longitude)
SELECT 'Barsik', 'Cat', 'grey', '12:30', 55.75, 37.61
WHERE NOT EXISTS (SELECT 1 FROM animals LIMIT 1);