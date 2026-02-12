import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "audi_west_island")

# Scraper
TARGET_URL = "https://www.audiwestisland.com/fr/inventaire/occasion/"
BASE_URL = "https://www.audiwestisland.com"
SCRAPE_TIMEOUT = int(os.getenv("SCRAPE_TIMEOUT", "60000"))
PAGE_LOAD_WAIT = int(os.getenv("PAGE_LOAD_WAIT", "30000"))

# Scheduler (24-hour sync cycle)
SYNC_INTERVAL_HOURS = int(os.getenv("SYNC_INTERVAL_HOURS", "24"))

# ML
MODEL_COLLECTION = "ml_models"
MIN_SAMPLES_FOR_TRAINING = 10
TEST_SIZE = 0.2
RANDOM_STATE = 42
CV_FOLDS = 5

# API
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")
