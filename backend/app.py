import logging
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from api import app, _run_sync_pipeline, db, predictor, _load_model
from config import SYNC_INTERVAL_HOURS, API_HOST, API_PORT, TARGET_URL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def scheduled_sync():
    """Runs every 24 hours to keep inventory fresh."""
    logger.info("=== Automated 24-hour sync triggered ===")
    try:
        result = await _run_sync_pipeline()
        logger.info(f"Automated sync complete: {result}")
    except Exception as e:
        logger.error(f"Automated sync failed: {e}")


@asynccontextmanager
async def lifespan(app):
    logger.info("Starting Audi West Island Inventory System...")

    _load_model()

    scheduler.add_job(
        scheduled_sync,
        trigger=IntervalTrigger(hours=SYNC_INTERVAL_HOURS),
        id="auto_sync",
        name=f"Automated sync every {SYNC_INTERVAL_HOURS} hours",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(f"Scheduler started: sync every {SYNC_INTERVAL_HOURS} hours")

    yield

    logger.info("Shutting down...")
    scheduler.shutdown()
    db.close()


app.router.lifespan_context = lifespan


@app.get("/", tags=["System"])
async def root():
    return {
        "name": "Audi West Island Inventory API",
        "version": "1.0.0",
        "author": "Ayush",
        "target": TARGET_URL,
        "docs": "/docs",
    }


@app.get("/automation-log", tags=["Sync"])
async def get_automation_log():
    """Returns scheduler config and recent sync history as proof of automation."""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": str(job.next_run_time),
            "trigger": str(job.trigger),
        })

    history = db.get_sync_history(limit=10)
    for s in history:
        if "timestamp" in s:
            s["timestamp"] = s["timestamp"].isoformat()

    return {
        "scheduler_running": scheduler.running,
        "sync_interval_hours": SYNC_INTERVAL_HOURS,
        "configured_jobs": jobs,
        "sync_history": history,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT)
