from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

# Opened/closed in the FastAPI lifespan (see main.py).
pool = ConnectionPool(
    settings.database_url,
    min_size=1,
    max_size=10,
    open=False,
    kwargs={"row_factory": dict_row},
)


def to_pgvector(vec: list[float]) -> str:
    """Format a vector as a pgvector literal; use with `%s::vector` in SQL."""
    return "[" + ",".join(map(str, vec)) + "]"
