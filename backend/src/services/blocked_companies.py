"""Blocked-company helpers. Single normalization rule used everywhere."""

from sqlalchemy import select
from src.core.database import async_session_maker


def normalize_company_name(name: str | None) -> str:
    """Lowercase + trim + collapse whitespace. Normalized-exact matching."""
    if not name:
        return ""
    return " ".join(name.strip().lower().split())


async def get_blocked_normalized_set() -> set[str]:
    """Load all blocked normalized names. Called once per parse batch."""
    from src.models.db_entities import BlockedCompany

    async with async_session_maker() as session:
        rows = (await session.execute(select(BlockedCompany.company_name_normalized))).scalars().all()
        return set(rows)


def is_company_blocked(company_name: str | None, blocked: set[str]) -> bool:
    return normalize_company_name(company_name) in blocked if blocked else False
