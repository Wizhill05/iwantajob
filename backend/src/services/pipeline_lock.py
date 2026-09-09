"""
Global pipeline mutex.

Every pipeline operation in the backend (Pipeline page parse triggers, cron
scraping jobs with auto-parse, unified reparse) must hold this lock while it
runs so that scraping/normalizing operations are truly serialized.

Why a dedicated mutex instead of a boolean status flag:
  * A plain "is busy" flag checked with `if flag: return` is a check-then-act
    race and is easily leaked when an operation crashes or is cancelled.
  * `asyncio.Lock` gives atomic acquire/release, and we always release it in a
    `finally` block, so the guard survives failures and cancellations.

The mutex is *task-owned and re-entrant*: the asyncio task that acquired it may
acquire it again (e.g. a cron job holds it for the whole scrape and then calls
`ParserService.run_parse` inside the same task). Re-entering is free instead of
deadlocking; the outermost release is what hands the lock to the next waiter.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class PipelineMutex:
    """A single asyncio mutex shared by every pipeline entry point."""

    def __init__(self, name: str = "pipeline") -> None:
        self._name = name
        self._lock = asyncio.Lock()
        self._owner: Optional[asyncio.Task] = None
        self._holder: Optional[str] = None
        self._depth = 0

    @property
    def name(self) -> str:
        return self._name

    @property
    def locked(self) -> bool:
        """True when some operation currently holds the mutex."""
        return self._lock.locked()

    @property
    def holder(self) -> Optional[str]:
        """Description of the operation currently holding the mutex (if any)."""
        return self._holder

    async def acquire(
        self,
        description: str,
        wait: bool = False,
        wait_timeout: float | None = None,
    ) -> bool:
        """
        Acquire the mutex.

        Args:
            description: Human readable name of the operation (used for logs
                and for the busy error surfaced to the UI).
            wait: When False, fail fast (return False) if the mutex is held.
                When True, wait until the previous operation fully finishes.
            wait_timeout: Optional cap (seconds) on how long to wait.

        Returns True when the mutex was acquired (or already held by this task).
        """
        current = asyncio.current_task()

        # Re-entrant acquisition from the owning task (nested operation).
        if current is not None and self._owner is current:
            self._depth += 1
            return True

        if not wait and self._lock.locked():
            return False

        if wait_timeout is not None:
            try:
                await asyncio.wait_for(self._lock.acquire(), wait_timeout)
            except (asyncio.TimeoutError, TimeoutError):
                logger.warning(
                    "Timed out after %.1fs waiting for the %s mutex (held by %s) for: %s",
                    wait_timeout,
                    self._name,
                    self._holder,
                    description,
                )
                return False
        else:
            await self._lock.acquire()

        self._owner = current
        self._holder = description
        if wait:
            logger.info("Pipeline operation started after waiting: %s", description)
        return True

    def release(self) -> None:
        """Release the mutex (no-op for nested acquisitions in the same task)."""
        current = asyncio.current_task()
        if current is not None and self._owner is current and self._depth > 0:
            self._depth -= 1
            return
        self._owner = None
        self._holder = None
        self._lock.release()


# Single shared instance for the whole backend process: UI endpoints, background
# parse tasks and the cron scheduler all serialize on this.
PIPELINE_LOCK = PipelineMutex()
