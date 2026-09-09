"""
Regression tests for pipeline operation serialization.

The Pipeline page used to be able to start the next batch operation while the
previous one was still finishing, surfacing a "PIPELINE_BUSY" error to the
user. These tests pin down the shared mutex semantics: overlapping operations
are rejected, queued, or wait — they never overlap, and the guard is always
released even when an operation fails.
"""

import asyncio

import pytest
from unittest.mock import AsyncMock, patch

from src.services.parser_service import ParserService
from src.services.pipeline_lock import PIPELINE_LOCK


@pytest.fixture(autouse=True)
def reset_pipeline_state():
    """Give every test a pristine pipeline guard and run state."""
    ParserService._active_run = None
    ParserService._pending_run = None
    ParserService._last_run = None
    PIPELINE_LOCK._lock = asyncio.Lock()
    PIPELINE_LOCK._owner = None
    PIPELINE_LOCK._holder = None
    PIPELINE_LOCK._depth = 0
    yield
    # Never leak a held lock or stale state into the next test.
    PIPELINE_LOCK._lock = asyncio.Lock()
    PIPELINE_LOCK._owner = None
    PIPELINE_LOCK._holder = None
    PIPELINE_LOCK._depth = 0


def _fake_runner(label: str, order: list[str], gate: asyncio.Event | None = None, delay: float = 0.0):
    async def runner(batch_size: int = 50, use_llm: bool = True):
        order.append(f"{label}:start")
        if gate is not None:
            await gate.wait()
        if delay:
            await asyncio.sleep(delay)
        order.append(f"{label}:end")
        return {"processed": 1, "promoted_to_unified": 1}

    return runner


# ---------------------------------------------------------------
# PipelineMutex primitives
# ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_mutex_rejects_second_operation_when_held():
    async def second_operation():
        return await PIPELINE_LOCK.acquire("op-2")

    assert await PIPELINE_LOCK.acquire("op-1") is True
    assert PIPELINE_LOCK.locked is True
    # Fail-fast acquisition from another task while held must not start it.
    assert await asyncio.create_task(second_operation()) is False
    assert PIPELINE_LOCK.holder == "op-1"
    PIPELINE_LOCK.release()
    assert PIPELINE_LOCK.locked is False
    # And it is usable again afterwards.
    assert await PIPELINE_LOCK.acquire("op-3") is True


@pytest.mark.asyncio
async def test_mutex_wait_blocks_until_previous_fully_finished():
    assert await PIPELINE_LOCK.acquire("op-1") is True

    acquired = asyncio.Event()

    async def waiter():
        assert await PIPELINE_LOCK.acquire("op-2", wait=True) is True
        acquired.set()

    task = asyncio.create_task(waiter())
    await asyncio.sleep(0.05)
    # Still waiting while op-1 holds the mutex.
    assert not acquired.is_set()
    PIPELINE_LOCK.release()
    await asyncio.wait_for(task, 2)
    assert acquired.is_set()
    assert PIPELINE_LOCK.holder == "op-2"


@pytest.mark.asyncio
async def test_mutex_wait_timeout_returns_false_without_stealing_lock():
    async def second_operation():
        return await PIPELINE_LOCK.acquire("op-2", wait=True, wait_timeout=0.05)

    assert await PIPELINE_LOCK.acquire("op-1") is True
    assert await asyncio.create_task(second_operation()) is False
    # The original owner still holds the mutex.
    assert PIPELINE_LOCK.locked is True
    assert PIPELINE_LOCK.holder == "op-1"
    PIPELINE_LOCK.release()


@pytest.mark.asyncio
async def test_mutex_is_reentrant_for_the_owning_task():
    assert await PIPELINE_LOCK.acquire("outer") is True
    # Nested acquisition by the same task (re-entrant lock).
    assert await PIPELINE_LOCK.acquire("inner", wait=True) is True
    PIPELINE_LOCK.release()
    # Inner release must not hand the lock over to another waiter.
    assert PIPELINE_LOCK.locked is True
    PIPELINE_LOCK.release()
    assert PIPELINE_LOCK.locked is False


# ---------------------------------------------------------------
# ParserService exclusivity
# ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_second_parse_trigger_while_first_in_flight_does_not_start_early():
    """A second trigger while a run is in flight must neither start early nor corrupt state."""
    order: list[str] = []
    gate = asyncio.Event()

    with patch.object(
        ParserService, "parse_indeed_jobs", _fake_runner("indeed", order, gate)
    ), patch.object(
        ParserService, "parse_linkedin_jobs", _fake_runner("linkedin", order)
    ), patch.object(
        ParserService, "parse_wellfound_jobs", _fake_runner("wellfound", order)
    ):
        first = asyncio.create_task(ParserService.run_parse("indeed"))
        await asyncio.sleep(0.05)

        state = ParserService.get_run_state()
        assert state["active_job"] is not None
        assert state["active_job"]["provider"] == "indeed"

        # Fail-fast triggers while the first run is in flight are rejected...
        assert await ParserService.run_parse("linkedin") is None

        # ...and a UI trigger queues behind it instead of starting early.
        assert ParserService.start_parse("linkedin") is not None
        # The running job is surfaced as active; the queued one is tracked too.
        assert ParserService.get_run_state()["active_job"]["provider"] == "indeed"
        assert ParserService._pending_run is not None
        assert ParserService._pending_run["provider"] == "linkedin"
        assert ParserService._pending_run["state"] == "queued"
        assert order == ["indeed:start"]

        # Only one run may be queued at a time.
        assert ParserService.start_parse("wellfound") is None

        gate.set()
        result = await asyncio.wait_for(first, 5)
        assert result == {"processed": 1, "promoted_to_unified": 1}

        # The queued background run finishes after the first one.
        for _ in range(100):
            await asyncio.sleep(0.05)
            if ParserService.get_run_state()["active_job"] is None:
                break

    assert order == [
        "indeed:start",
        "indeed:end",
        "linkedin:start",
        "linkedin:end",
    ]
    final_state = ParserService.get_run_state()
    assert final_state["active_job"] is None
    assert final_state["last_job"]["provider"] == "linkedin"
    assert final_state["last_job"]["status"] == "completed"
    assert PIPELINE_LOCK.locked is False


@pytest.mark.asyncio
async def test_waiting_parse_starts_only_after_previous_completes():
    """With wait=True the next operation is queued until the previous fully finishes."""
    order: list[str] = []
    gate = asyncio.Event()

    with patch.object(
        ParserService, "parse_indeed_jobs", _fake_runner("indeed", order, gate)
    ), patch.object(
        ParserService, "parse_linkedin_jobs", _fake_runner("linkedin", order)
    ):
        first = asyncio.create_task(ParserService.run_parse("indeed"))
        await asyncio.sleep(0.05)

        # The next batch starts while the previous one is still finishing...
        second = asyncio.create_task(
            ParserService.run_parse("linkedin", wait=True, wait_timeout=10)
        )
        await asyncio.sleep(0.05)

        # ...but it has not begun doing work yet — it is queued on the mutex.
        assert order == ["indeed:start"]
        assert not second.done()

        gate.set()
        await asyncio.wait_for(asyncio.gather(first, second), 5)

    assert order == ["indeed:start", "indeed:end", "linkedin:start", "linkedin:end"]
    assert ParserService.get_run_state()["active_job"] is None
    assert ParserService.get_run_state()["last_job"]["provider"] == "linkedin"
    assert PIPELINE_LOCK.locked is False


@pytest.mark.asyncio
async def test_lock_released_when_parse_fails():
    """A failing run must release the guard so later operations can still run."""
    order: list[str] = []

    async def failing_runner(batch_size: int = 50, use_llm: bool = True):
        order.append("indeed:start")
        raise RuntimeError("boom")

    with patch.object(ParserService, "parse_indeed_jobs", failing_runner), patch.object(
        ParserService, "parse_linkedin_jobs", _fake_runner("linkedin", order)
    ):
        with pytest.raises(RuntimeError, match="boom"):
            await ParserService.run_parse("indeed")

        # Guard released and state recorded as failed.
        assert PIPELINE_LOCK.locked is False
        assert ParserService.get_run_state()["active_job"] is None
        assert ParserService.get_run_state()["last_job"]["status"] == "failed"
        assert "boom" in ParserService.get_run_state()["last_job"]["error"]

        # The pipeline is usable again immediately.
        result = await asyncio.wait_for(ParserService.run_parse("linkedin"), 5)
        assert result == {"processed": 1, "promoted_to_unified": 1}

    assert order == ["indeed:start", "linkedin:start", "linkedin:end"]


@pytest.mark.asyncio
async def test_lock_released_when_background_run_is_cancelled():
    """Cancellation (e.g. shutdown) must not leave the pipeline permanently busy."""
    order: list[str] = []
    gate = asyncio.Event()

    with patch.object(ParserService, "parse_indeed_jobs", _fake_runner("indeed", order, gate)):
        started = ParserService.start_parse("indeed", batch_size=10)
        assert started is not None
        await asyncio.sleep(0.05)

        task = next(
            t
            for t in asyncio.all_tasks()
            if t is not asyncio.current_task() and "_run_background" in repr(t.get_coro())
        )
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    assert PIPELINE_LOCK.locked is False
    assert ParserService.get_run_state()["active_job"] is None
    assert ParserService.get_run_state()["last_job"]["status"] == "failed"


@pytest.mark.asyncio
async def test_failed_run_does_not_leave_queued_slot_stuck():
    """A failing queued run clears both the pending slot and the lock."""
    order: list[str] = []
    gate = asyncio.Event()

    async def failing_runner(batch_size: int = 50, use_llm: bool = True):
        order.append("indeed:start")
        raise RuntimeError("boom")

    with patch.object(ParserService, "parse_indeed_jobs", failing_runner), patch.object(
        ParserService, "parse_linkedin_jobs", _fake_runner("linkedin", order)
    ):
        assert ParserService.start_parse("indeed") is not None
        await asyncio.sleep(0.05)

        gate.set()
        for _ in range(100):
            await asyncio.sleep(0.05)
            if ParserService.get_run_state()["active_job"] is None:
                break

        assert ParserService.get_run_state()["last_job"]["status"] == "failed"

        # The queued slot is free again, so a new operation can be triggered.
        assert ParserService.start_parse("linkedin") is not None
        for _ in range(100):
            await asyncio.sleep(0.05)
            if ParserService.get_run_state()["active_job"] is None:
                break

    assert order == ["indeed:start", "linkedin:start", "linkedin:end"]
    assert PIPELINE_LOCK.locked is False
