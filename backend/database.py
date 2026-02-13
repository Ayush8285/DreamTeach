import logging
from datetime import datetime, timezone
from typing import Optional
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.collection import Collection
from bson import ObjectId

from config import MONGODB_URI, MONGODB_DB_NAME

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Database:
    def __init__(self):
        self.client = MongoClient(MONGODB_URI)
        self.db = self.client[MONGODB_DB_NAME]
        self.vehicles: Collection = self.db["vehicles"]
        self.sync_logs: Collection = self.db["sync_logs"]
        self.price_history: Collection = self.db["price_history"]
        self._ensure_indexes()

    def _ensure_indexes(self):
        self.vehicles.create_index([("vin", ASCENDING)], unique=True)
        self.vehicles.create_index([("status", ASCENDING)])
        self.vehicles.create_index([("price", ASCENDING)])
        self.vehicles.create_index([("year", DESCENDING)])
        self.vehicles.create_index([("make", ASCENDING), ("model", ASCENDING)])
        self.sync_logs.create_index([("timestamp", DESCENDING)])
        self.price_history.create_index(
            [("vin", ASCENDING), ("timestamp", DESCENDING)]
        )

    def sync_vehicles(self, scraped_vehicles: list[dict], source: str = "manual") -> dict:
        """
        Compare scraped data with DB:
        - Insert new vehicles (VIN not in DB)
        - Update changed fields on existing vehicles
        - Mark vehicles missing from scrape as inactive
        """
        timestamp = datetime.now(timezone.utc)
        scraped_vins = set()
        added = updated = removed = unchanged = 0
        added_details = []
        updated_details = []
        removed_details = []

        for vehicle in scraped_vehicles:
            vin = vehicle.get("vin")
            if not vin:
                continue

            scraped_vins.add(vin)
            existing = self.vehicles.find_one({"vin": vin})

            if existing is None:
                vehicle["date_scraped"] = timestamp
                vehicle["last_seen"] = timestamp
                vehicle["status"] = "active"
                vehicle["created_at"] = timestamp
                self.vehicles.insert_one(vehicle)
                added += 1
                added_details.append({"title": vehicle.get("title", vin)})
                logger.info(f"Added new vehicle: {vin}")

                if vehicle.get("price"):
                    self._record_price(vin, vehicle["price"], timestamp)
            else:
                changes = self._detect_changes(existing, vehicle)
                if changes:
                    if "price" in changes and vehicle.get("price"):
                        self._record_price(vin, vehicle["price"], timestamp)

                    # Track what changed for this vehicle
                    change_info = {"title": existing.get("title", vin), "fields": {}}
                    for field in changes:
                        if field in ("last_seen", "status"):
                            continue
                        change_info["fields"][field] = {
                            "old": existing.get(field),
                            "new": changes[field],
                        }
                    if change_info["fields"]:
                        updated_details.append(change_info)

                    changes["last_seen"] = timestamp
                    changes["status"] = "active"
                    self.vehicles.update_one({"vin": vin}, {"$set": changes})
                    updated += 1
                    logger.info(f"Updated vehicle {vin}: {list(changes.keys())}")
                else:
                    self.vehicles.update_one(
                        {"vin": vin},
                        {"$set": {"last_seen": timestamp, "status": "active"}}
                    )
                    unchanged += 1

        # mark anything we didn't see this scrape as removed
        for db_vehicle in self.vehicles.find({"status": "active"}):
            if db_vehicle["vin"] not in scraped_vins:
                self.vehicles.update_one(
                    {"vin": db_vehicle["vin"]},
                    {"$set": {"status": "removed", "removed_at": timestamp}}
                )
                removed += 1
                removed_details.append({"title": db_vehicle.get("title", db_vehicle["vin"])})
                logger.info(f"Marked vehicle as removed: {db_vehicle['vin']}")

        sync_summary = {
            "timestamp": timestamp,
            "source": source,
            "total_scraped": len(scraped_vehicles),
            "added": added,
            "updated": updated,
            "removed": removed,
            "unchanged": unchanged,
            "total_active": self.vehicles.count_documents({"status": "active"}),
            "added_details": added_details,
            "updated_details": updated_details,
            "removed_details": removed_details,
        }
        self.sync_logs.insert_one(sync_summary)
        logger.info(f"Sync complete: {sync_summary}")
        return sync_summary

    def _detect_changes(self, existing: dict, scraped: dict) -> dict:
        changes = {}
        compare_fields = [
            "price", "mileage", "title", "fuel_type",
            "transmission", "exterior_color", "interior_color",
            "drivetrain", "engine", "body_style", "trim",
        ]
        for field in compare_fields:
            new_val = scraped.get(field)
            old_val = existing.get(field)
            if new_val is not None and new_val != old_val:
                changes[field] = new_val
        return changes

    def _record_price(self, vin: str, price: int, timestamp: datetime):
        self.price_history.insert_one({
            "vin": vin, "price": price, "timestamp": timestamp,
        })

    # ── Queries ───────────────────────────────────────────────────────

    def get_active_vehicles(self) -> list[dict]:
        return list(
            self.vehicles.find({"status": "active"}, {"_id": 0})
            .sort("date_scraped", DESCENDING)
        )

    def get_all_vehicles(self, include_removed=False) -> list[dict]:
        query = {} if include_removed else {"status": "active"}
        return list(
            self.vehicles.find(query, {"_id": 0}).sort("date_scraped", DESCENDING)
        )

    def get_vehicle_by_vin(self, vin: str) -> Optional[dict]:
        return self.vehicles.find_one({"vin": vin}, {"_id": 0})

    def get_vehicle_by_id(self, vehicle_id: str) -> Optional[dict]:
        try:
            vehicle = self.vehicles.find_one({"_id": ObjectId(vehicle_id)})
            if vehicle:
                vehicle["_id"] = str(vehicle["_id"])
            return vehicle
        except Exception:
            return self.get_vehicle_by_vin(vehicle_id)

    def search_vehicles(self, make=None, model=None, year_min=None,
                        year_max=None, price_min=None, price_max=None,
                        fuel_type=None, transmission=None) -> list[dict]:
        query = {"status": "active"}
        if make:
            query["make"] = {"$regex": make, "$options": "i"}
        if model:
            query["model"] = {"$regex": model, "$options": "i"}
        if year_min:
            query.setdefault("year", {})["$gte"] = year_min
        if year_max:
            query.setdefault("year", {})["$lte"] = year_max
        if price_min:
            query.setdefault("price", {})["$gte"] = price_min
        if price_max:
            query.setdefault("price", {})["$lte"] = price_max
        if fuel_type:
            query["fuel_type"] = {"$regex": fuel_type, "$options": "i"}
        if transmission:
            query["transmission"] = {"$regex": transmission, "$options": "i"}

        return list(self.vehicles.find(query, {"_id": 0}).sort("price", ASCENDING))

    def get_price_history(self, vin: str) -> list[dict]:
        return list(
            self.price_history.find({"vin": vin}, {"_id": 0}).sort("timestamp", ASCENDING)
        )

    # ── Sync status ───────────────────────────────────────────────────

    def get_last_sync(self) -> Optional[dict]:
        return self.sync_logs.find_one({}, {"_id": 0}, sort=[("timestamp", DESCENDING)])

    def get_sync_history(self, limit=10, source=None) -> list[dict]:
        query = {"source": source} if source else {}
        return list(
            self.sync_logs.find(query, {"_id": 0}).sort("timestamp", DESCENDING).limit(limit)
        )

    # ── Stats ─────────────────────────────────────────────────────────

    def get_inventory_stats(self) -> dict:
        active = list(self.vehicles.find({"status": "active"}))
        if not active:
            return {
                "total_active": 0, "total_removed": 0,
                "avg_price": 0, "avg_mileage": 0,
                "price_range": {"min": 0, "max": 0},
                "year_range": {"min": 0, "max": 0},
                "makes": {}, "models": {},
            }

        prices = [v["price"] for v in active if v.get("price")]
        mileages = [v["mileage"] for v in active if v.get("mileage")]
        years = [v["year"] for v in active if v.get("year")]

        makes, models = {}, {}
        for v in active:
            mk = v.get("make", "Unknown")
            md = v.get("model", "Unknown")
            makes[mk] = makes.get(mk, 0) + 1
            models[md] = models.get(md, 0) + 1

        return {
            "total_active": len(active),
            "total_removed": self.vehicles.count_documents({"status": "removed"}),
            "avg_price": round(sum(prices) / len(prices)) if prices else 0,
            "avg_mileage": round(sum(mileages) / len(mileages)) if mileages else 0,
            "price_range": {"min": min(prices) if prices else 0, "max": max(prices) if prices else 0},
            "year_range": {"min": min(years) if years else 0, "max": max(years) if years else 0},
            "makes": makes,
            "models": models,
        }

    def update_predicted_prices(self, predictions: dict):
        """Batch-update predicted prices. Pre-fetch actual prices to avoid N+1 queries."""
        # grab all actual prices in one query
        vins = list(predictions.keys())
        price_map = {}
        for doc in self.vehicles.find({"vin": {"$in": vins}}, {"vin": 1, "price": 1}):
            price_map[doc["vin"]] = doc.get("price", 0)

        for vin, predicted in predictions.items():
            actual = price_map.get(vin, predicted)
            self.vehicles.update_one(
                {"vin": vin},
                {"$set": {
                    "predicted_price": round(predicted),
                    "price_difference": round(predicted - actual),
                }}
            )

    def close(self):
        self.client.close()
