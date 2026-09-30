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

Снаружи опубликован только порт Nginx (`8080`). Backend и PostgreSQL доступны только внутри Docker network `animal-net`.

## Переменные PostgreSQL

Compose содержит безопасные для локальной разработки значения по умолчанию, поэтому `.env` для первого запуска не обязателен.

Чтобы задать свои значения:

```bash
cp .env.example .env
```

и отредактировать `.env`.

## Важное замечание о старой БД

`docker-entrypoint-initdb.d/init.sql` автоматически выполняется только при создании пустого volume PostgreSQL.

Если до этой версии проекта уже существовал старый `postgres_data`, проще всего для учебного проекта пересоздать БД:

```bash
docker compose down -v
docker compose up -d --build
```

Это удаляет старые данные.
