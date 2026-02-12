import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS
from database import Database
from ml_model import VehiclePricePredictor
from scraper import AudiWestIslandScraper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Audi West Island Inventory API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database()
predictor = VehiclePricePredictor()
is_syncing = False
sync_stage = ""


def _load_model():
    """Try loading a previously trained model from MongoDB."""
    global predictor
    try:
        model_doc = db.db["ml_models"].find_one(
            {"type": "price_predictor"},
            sort=[("timestamp", -1)],
        )
        if model_doc and "model_data" in model_doc:
            predictor.deserialize(model_doc["model_data"])
            logger.info("ML model loaded from database.")
        else:
            logger.info("No saved ML model found. Training required.")
    except Exception as e:
        logger.error(f"Error loading model: {e}")


_load_model()


# ── Vehicle endpoints ────────────────────────────────────────────────

@app.get("/vehicles", tags=["Vehicles"])
async def get_vehicles(include_removed: bool = Query(False)):
    vehicles = db.get_all_vehicles(include_removed=include_removed)
    return {"total": len(vehicles), "vehicles": vehicles}


@app.get("/vehicles/search", tags=["Vehicles"])
async def search_vehicles(
    make: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    year_min: Optional[int] = Query(None),
    year_max: Optional[int] = Query(None),
    price_min: Optional[int] = Query(None),
    price_max: Optional[int] = Query(None),
    fuel_type: Optional[str] = Query(None),
    transmission: Optional[str] = Query(None),
):
    vehicles = db.search_vehicles(
        make=make, model=model,
        year_min=year_min, year_max=year_max,
        price_min=price_min, price_max=price_max,
        fuel_type=fuel_type, transmission=transmission,
    )
    applied = {
        k: v for k, v in {
            "make": make, "model": model,
            "year_min": year_min, "year_max": year_max,
            "price_min": price_min, "price_max": price_max,
            "fuel_type": fuel_type, "transmission": transmission,
        }.items() if v is not None
    }
    return {"total": len(vehicles), "filters_applied": applied, "vehicles": vehicles}


@app.get("/vehicles/stats", tags=["Vehicles"])
async def get_inventory_stats():
    return db.get_inventory_stats()


@app.get("/vehicles/{vehicle_id}", tags=["Vehicles"])
async def get_vehicle(vehicle_id: str):
    vehicle = db.get_vehicle_by_id(vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@app.get("/vehicles/{vehicle_id}/predict", tags=["ML Predictions"])
async def predict_vehicle_price(vehicle_id: str):
    vehicle = db.get_vehicle_by_id(vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not predictor.is_trained:
        raise HTTPException(status_code=503, detail="ML model not trained yet. Run a sync first.")

    prediction = predictor.predict(vehicle)
    if not prediction:
        raise HTTPException(status_code=422, detail="Unable to generate prediction for this vehicle.")
    return {"vin": vehicle.get("vin"), "title": vehicle.get("title"), **prediction}


@app.get("/vehicles/{vehicle_id}/price-history", tags=["Vehicles"])
async def get_vehicle_price_history(vehicle_id: str):
    vehicle = db.get_vehicle_by_id(vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    history = db.get_price_history(vehicle.get("vin", vehicle_id))
    return {
        "vin": vehicle.get("vin"),
        "title": vehicle.get("title"),
        "current_price": vehicle.get("price"),
        "history": history,
    }


# ── Sync endpoints ───────────────────────────────────────────────────

@app.get("/sync-status", tags=["Sync"])
async def get_sync_status():
    last_sync = db.get_last_sync()
    history = db.get_sync_history(limit=10)

    if not last_sync:
        return {"status": "never_synced", "message": "No sync yet.", "last_sync": None, "history": []}

    for s in history:
        if "timestamp" in s:
            s["timestamp"] = s["timestamp"].isoformat()
    if "timestamp" in last_sync:
        last_sync["timestamp"] = last_sync["timestamp"].isoformat()

    return {"status": "completed", "last_sync": last_sync, "history": history}


async def _run_sync_pipeline():
    """Full pipeline: scrape -> sync -> retrain -> predict -> save model."""
    global is_syncing, predictor, sync_stage
    is_syncing = True
    sync_stage = "scraping"

    try:
        # 1) Scrape
        logger.info("Pipeline: Starting scrape...")
        scraper = AudiWestIslandScraper()
        vehicles = await scraper.scrape_inventory()
        logger.info(f"Pipeline: Scraped {len(vehicles)} vehicles")

        # 2) Sync to DB
        sync_stage = "syncing"
        logger.info("Pipeline: Syncing to database...")
        sync_result = db.sync_vehicles(vehicles)
        logger.info(f"Pipeline: Sync complete - {sync_result}")

        # 3) Retrain
        sync_stage = "training"
        logger.info("Pipeline: Retraining ML model...")
        active_vehicles = db.get_active_vehicles()
        training_result = predictor.train(active_vehicles)
        logger.info(f"Pipeline: Training complete - {training_result}")

        # 4) Predict + persist
        sync_stage = "predicting"
        if predictor.is_trained:
            predictions = predictor.predict_batch(active_vehicles)
            db.update_predicted_prices(predictions)
            logger.info(f"Pipeline: Updated {len(predictions)} predictions")

            model_data = predictor.serialize()
            db.db["ml_models"].update_one(
                {"type": "price_predictor"},
                {"$set": {
                    "type": "price_predictor",
                    "model_data": model_data,
                    "timestamp": predictor.training_timestamp,
                    "metrics": predictor.metrics,
                    "best_model": predictor.best_model_name,
                }},
                upsert=True,
            )
            logger.info("Pipeline: Model saved to database")

        sync_stage = "done"
        return {
            "scrape_result": {"vehicles_found": len(vehicles)},
            "sync_result": sync_result,
            "training_result": training_result,
        }
    except Exception as e:
        sync_stage = f"error: {e}"
        logger.error(f"Pipeline error: {e}")
        raise
    finally:
        is_syncing = False


@app.get("/sync-progress", tags=["Sync"])
async def get_sync_progress():
    return {"is_syncing": is_syncing, "stage": sync_stage}


@app.post("/trigger-sync", tags=["Sync"])
async def trigger_sync(background_tasks: BackgroundTasks):
    global is_syncing
    if is_syncing:
        return {"status": "already_running", "message": "A sync is already in progress."}
    background_tasks.add_task(_run_sync_pipeline)
    return {"status": "started", "message": "Sync pipeline started in background. Check /sync-status for progress."}


@app.post("/trigger-sync-blocking", tags=["Sync"])
async def trigger_sync_blocking():
    """Blocking sync — waits until complete. Used by n8n workflow."""
    global is_syncing
    if is_syncing:
        raise HTTPException(status_code=409, detail="A sync is already in progress.")
    result = await _run_sync_pipeline()
    return {"status": "completed", "result": result}


# ── ML endpoints ─────────────────────────────────────────────────────

@app.get("/ml/summary", tags=["ML Predictions"])
async def get_model_summary():
    return predictor.get_model_summary()


@app.get("/ml/predictions", tags=["ML Predictions"])
async def get_all_predictions():
    if not predictor.is_trained:
        raise HTTPException(status_code=503, detail="ML model not trained yet.")

    vehicles = db.get_active_vehicles()
    results = []
    for v in vehicles:
        pred = predictor.predict(v)
        if pred:
            results.append({
                "vin": v.get("vin"),
                "title": v.get("title"),
                "actual_price": v.get("price"),
                "predicted_price": pred["predicted_price"],
                "price_difference": pred["price_difference"],
            })

    return {"model_used": predictor.best_model_name, "total_predictions": len(results), "predictions": results}


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "ml_model_trained": predictor.is_trained,
        "is_syncing": is_syncing,
    }
