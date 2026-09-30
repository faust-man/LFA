# Test backend + PostgreSQL

Запуск:

```bash
docker compose up -d --build
```

Проверка:

```bash
curl http://localhost:5000/health
curl http://localhost:5000/api/animals
```

Добавить животное:

```bash
curl -X POST http://localhost:5000/api/animals \
  -H "Content-Type: application/json" \
  -d '{"name":"Рекс","species":"dog","latitude":55.73,"longitude":37.60}'
```

Остановить:

```bash
docker compose down
```

Удалить контейнеры вместе с данными PostgreSQL:

```bash
docker compose down -v
```
