# Animal Map — Flask + PostgreSQL + Nginx

## Быстрый запуск

Нужны Docker и Docker Compose.

```bash
docker compose up -d --build
```

Открыть сайт:

```text
http://localhost:8080
```

Проверить всю цепочку Nginx -> Flask -> PostgreSQL:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/animals
```

Посмотреть контейнеры:

```bash
docker compose ps
```

Посмотреть логи:

```bash
docker compose logs -f
```

Остановить:

```bash
docker compose down
```

Удалить также volume PostgreSQL и начать с чистой БД:

```bash
docker compose down -v
```

## Архитектура

```text
Browser
   |
   | http://localhost:8080
   v
Nginx :80
   |-- /, *.js, *.css -> static frontend
   |
   `-- /api/*, /health -> backend:5000
                              |
                              v
                         PostgreSQL :5432
```

Снаружи опубликован только порт Nginx (`8080`). Backend, PostgreSQL и Redis доступны только внутри Docker network `animal-net`.

## Переменные PostgreSQL

Compose содержит безопасные для локальной разработки значения по умолчанию, поэтому `.env` для первого запуска не обязателен.

Чтобы задать свои значения:

```bash
cp .env.example .env
```

и отредактировать `.env`.

## Существующая база данных

При каждом запуске сервис `migrate` применяет `database/init.sql` в одной транзакции,
создаёт недостающие таблицы и добавляет новые столбцы. Backend запускается только
после успешной миграции и готовности PostgreSQL и Redis. Существующие данные сохраняются.

Если PostgreSQL volume уже создан, используйте в `.env` те же имя базы, пользователя
и пароль, что при его создании. Изменение `.env` само по себе не меняет пароль в БД.
При ошибке подключения проверьте `docker compose logs migrate`.

## Backend и API

Backend запускается через Gunicorn. Redis хранит счётчики ограничения запросов:
30 запросов в минуту на каждый API endpoint и IP клиента. `/health` не ограничивается.
Фронтенд обращается к `/api/*` через Nginx на адресе сайта.
Размер тела запроса в Nginx ограничен 10 МБ, включая фотографию.

Порт сайта по умолчанию — `8080`; его можно изменить через `HTTP_PORT` в `.env`.

## Проверки

После запуска контейнеров выполните проверку связки Nginx → Backend → БД:

```bash
python tests/smoke.py
```

Для другого порта или адреса:

```bash
python tests/smoke.py http://localhost:8081
```

Проверка создаёт временную метку и объявление, проверяет чтение, обновление,
валидацию и удаляет только свои тестовые записи.

Модульные проверки (требуются зависимости Backend):

```bash
python -m unittest discover -s tests -p "test_*.py"
```

Либо запустите их с зависимостями собранного контейнера из корня проекта:

```bash
docker compose run --rm --no-deps -v "${PWD}:/workspace:ro" -w /workspace backend python -m unittest discover -s tests -p "test_*.py"
```

Проверка координат меток в настольном и мобильном режимах (после запуска Docker Compose):

```bash
docker run --rm --network lfa_animal-net -v "${PWD}:/workspace:ro" -w /workspace node:22-alpine node tests/test_marker.cjs
```

Тест проверяет Москву, точку 0,0 и координаты в других полушариях:
обработчик события → API → БД → отрисовка и восстановление метки.
Все созданные тестом записи удаляются.
