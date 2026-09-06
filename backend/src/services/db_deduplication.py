import logging
from typing import Sequence
from sqlalchemy import select, or_
from src.core.database import async_session_maker
from src.models.db_entities import RawIndeedJob, RawLinkedInJob, RawWellfoundJob, UnifiedJob
from src.utils.url_normalizer import normalize_job_url

logger = logging.getLogger(__name__)

async def check_jobs_exist_in_db(
    items: Sequence[dict[str, str | None]],
) -> set[tuple[str, str]]:
    """
    Given a list of job descriptors with keys:
    - 'source': 'indeed' | 'linkedin' | 'wellfound'
    - 'external_id': str
    - 'url': str | None

    Returns a set of tuples: (source, external_id) that already exist in either
    raw tables or unified_jobs, or match an existing unified_jobs url.
    """
    if not items:
        return set()

    found_keys: set[tuple[str, str]] = set()

    # Collect identifiers
    indeed_ids = [it["external_id"] for it in items if it.get("source") == "indeed" and it.get("external_id")]
    linkedin_ids = [it["external_id"] for it in items if it.get("source") == "linkedin" and it.get("external_id")]
    wellfound_ids = [it["external_id"] for it in items if it.get("source") == "wellfound" and it.get("external_id")]

    # Normalize URLs
    url_to_item_keys: dict[str, list[tuple[str, str]]] = {}
    for it in items:
        source = it.get("source") or ""
        ext_id = it.get("external_id") or ""
        raw_url = it.get("url")
        if raw_url:
            norm_url = normalize_job_url(raw_url)
            if norm_url:
                url_to_item_keys.setdefault(norm_url, []).append((source, ext_id))
            url_to_item_keys.setdefault(raw_url, []).append((source, ext_id))

    async with async_session_maker() as session:
        # Check raw indeed
        if indeed_ids:
            res = await session.execute(
                select(RawIndeedJob.external_id).where(RawIndeedJob.external_id.in_(indeed_ids))
            )
            for eid in res.scalars().all():
                found_keys.add(("indeed", eid))

        # Check raw linkedin
        if linkedin_ids:
            res = await session.execute(
                select(RawLinkedInJob.external_id).where(RawLinkedInJob.external_id.in_(linkedin_ids))
            )
            for eid in res.scalars().all():
                found_keys.add(("linkedin", eid))

        # Check raw wellfound
        if wellfound_ids:
            res = await session.execute(
                select(RawWellfoundJob.external_id).where(RawWellfoundJob.external_id.in_(wellfound_ids))
            )
            for eid in res.scalars().all():
                found_keys.add(("wellfound", eid))

        # Check unified jobs by (source, external_id)
        all_ext_ids = [it["external_id"] for it in items if it.get("external_id")]
        if all_ext_ids:
            res = await session.execute(
                select(UnifiedJob.source, UnifiedJob.external_id).where(
                    UnifiedJob.external_id.in_(all_ext_ids)
                )
            )
            for src, eid in res.all():
                found_keys.add((src, eid))

        # Check unified jobs by URL
        if url_to_item_keys:
            urls_to_check = list(url_to_item_keys.keys())
            res = await session.execute(
                select(UnifiedJob.url).where(UnifiedJob.url.in_(urls_to_check))
            )
            for u in res.scalars().all():
                norm = normalize_job_url(u)
                if norm in url_to_item_keys:
                    for key in url_to_item_keys[norm]:
                        found_keys.add(key)
                if u in url_to_item_keys:
                    for key in url_to_item_keys[u]:
                        found_keys.add(key)

    return found_keys
