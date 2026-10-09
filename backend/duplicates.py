"""Reject identical stored data; serialize checks and writes across workers."""
from psycopg import sql


COLUMNS = {
    "animals": (
        "name", "species", "color", "observed_time", "observed_date",
        "latitude", "longitude", "photo_data", "behavior", "state", "ready",
        "contact", "address",
    ),
    "lost_ads": (
        "nickname", "character", "contact", "species", "color", "lost_time",
        "lost_date", "address", "latitude", "longitude", "photo_data",
    ),
}
LOCK_KEYS = {"animals": 120901, "lost_ads": 120902}


class DuplicateRecord(Exception):
    def __init__(self, record_id):
        self.record_id = record_id
        super().__init__("Такая запись уже существует")


def lock_writes(cursor, table):
    # Held until the transaction commits/rolls back, including the following INSERT.
    cursor.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_KEYS[table],))


def check_duplicate(cursor, table, values, exclude_id=None):
    fields = dict(zip(COLUMNS[table], values, strict=True))
    for name in ("latitude", "longitude"):
        if fields[name] is not None:
            fields[name] = float(fields[name])
    conditions = [sql.SQL("{} IS NOT DISTINCT FROM %s").format(sql.Identifier(name))
                  for name in fields]
    params = list(fields.values())
    if exclude_id is not None:
        conditions.append(sql.SQL("id <> %s"))
        params.append(exclude_id)
    query = sql.SQL("SELECT id FROM {} WHERE {} ORDER BY id LIMIT 1").format(
        sql.Identifier(table), sql.SQL(" AND ").join(conditions))
    cursor.execute(query, params)
    existing = cursor.fetchone()
    if existing:
        raise DuplicateRecord(existing["id"])


def check_update(cursor, table, record_id, changes):
    lock_writes(cursor, table)
    cursor.execute(sql.SQL("SELECT * FROM {} WHERE id = %s").format(sql.Identifier(table)),
                   (record_id,))
    existing = cursor.fetchone()
    if existing is not None:
        existing.update(changes)
        check_duplicate(cursor, table, [existing[name] for name in COLUMNS[table]], record_id)
