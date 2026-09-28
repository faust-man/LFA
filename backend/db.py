"""
Работа с БД строго через параметризованные запросы (psycopg сам
экранирует параметры) — это и есть защита от SQL-инъекций.
НИКОГДА не собирайте SQL через f-строки/конкатенацию со значениями
от пользователя.
"""
import logging

from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None


def init_pool(database_url: str) -> None:
    global _pool
    _pool = ConnectionPool(
        conninfo=database_url,
        min_size=1,
        max_size=10,
        kwargs={"row_factory": dict_row},
    )
    logger.info("Пул соединений с БД инициализирован")


def get_pool() -> ConnectionPool:
    if _pool is None:
        raise RuntimeError("Пул БД не инициализирован — вызовите init_pool() при старте")
    return _pool


def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()


def fetch_one(query: str, params: tuple = ()) -> dict | None:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchone()


def execute(query: str, params: tuple = ()) -> None:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
        conn.commit()


def execute_returning(query: str, params: tuple = ()) -> dict | None:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            row = cur.fetchone()
        conn.commit()
        return row
