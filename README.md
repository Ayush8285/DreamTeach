# Audi West Island — Used Car Inventory Pipeline

**By Ayush**

A full-stack data pipeline that scrapes the Audi West Island used car inventory, syncs it into MongoDB, runs ML price predictions, and serves everything through a REST API with a React dashboard.

**Live Links:**
- Frontend: [https://audi-dream.vercel.app](https://audi-dream.vercel.app)
- Backend API: [https://audi-inventory-api.onrender.com/docs](https://audi-inventory-api.onrender.com/docs)

---

## What This Does

The whole thing runs as a pipeline:

1. **Scrape** — Playwright opens a headless Chromium browser, navigates through all the pages on the Audi West Island used car site, and pulls every listing it can find (title, VIN, price, mileage, year, fuel type, transmission, colors, drivetrain, etc.)
2. **Sync to MongoDB** — Compares what was scraped against what's already in the database. New cars get added, sold cars get marked as removed, and any changes (like price drops) get tracked with full history.
3. **Train ML models** — Four regression models (Linear Regression, Random Forest, Gradient Boosting, XGBoost) are trained on the current inventory. The best one (by R² score) is selected automatically.
4. **Predict prices** — The winning model predicts what each car "should" cost based on its features. This helps spot deals — cars priced below prediction are highlighted in the dashboard.
5. **Repeat every 24 hours** — APScheduler triggers this whole pipeline automatically. The database stays fresh without anyone touching it.

```
  Audi West Island Website
          |
     [Playwright Scraper]
          |
     [MongoDB Atlas] <-- 24hr automated sync
          |
     [ML Training: LR / RF / GB / XGB]
          |
     [FastAPI REST API]
          |
     [React Dashboard on Vercel]
```

---

## Tech Stack

| Layer | What I Used |
|-------|-------------|
| Scraping | Playwright (headless Chromium) — handles JS-rendered pages and pagination |
| Database | MongoDB Atlas via PyMongo |
| ML | scikit-learn + XGBoost (4 models, auto-selects best) |
| Backend | FastAPI + Uvicorn, APScheduler for 24hr cron |
| Frontend | React + Vite, Tailwind CSS, Recharts for charts |
| Deployment | Render (backend + Docker), Vercel (frontend) |

---

## Project Structure

```
backend/
  app.py                  -- entry point, starts the scheduler and server
  scraper.py              -- Playwright scraping logic, pagination handling
  database.py             -- MongoDB models, sync logic (add/remove/update)
  ml_model.py             -- model training, prediction, serialization
  api.py                  -- all FastAPI endpoints
  config.py               -- env vars and constants
  automation_config.json  -- automation workflow export (assignment requirement)
  requirements.txt
  Dockerfile
  .env.example

frontend/
  src/
    App.jsx               -- main app, tab navigation, data fetching
    components/
      Dashboard.jsx       -- charts, stats cards, top deals
      VehicleTable.jsx    -- sortable table with search, pagination, deal tags
      SearchFilter.jsx    -- filter by make, model, year, price range
      SyncStatus.jsx      -- sync control, progress tracker, history
      MLMetrics.jsx       -- model comparison table, feature importance
    lib/api.js            -- axios API client
  vercel.json
  tailwind.config.js
```

---

## How to Run Locally

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

pip install -r requirements.txt
playwright install chromium

# create .env from the example and add your MongoDB URI
cp .env.example .env

python app.py
# runs at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install

# point to local backend
echo VITE_API_URL=http://localhost:8000 > .env

npm run dev
# opens at http://localhost:5173
```

### Docker (backend only)

```bash
cd backend
docker build -t audi-api .
docker run -p 8000:8000 --env-file .env audi-api
```

---

## API Endpoints

| Method | Endpoint | What it does |
|--------|----------|--------------|
| GET | `/vehicles` | All active vehicles (with predicted prices) |
| GET | `/vehicles/search?make=Audi&year_min=2022` | Filter/search vehicles |
| GET | `/vehicles/{id}` | Single vehicle details |
| GET | `/vehicles/{id}/predict` | ML price prediction for one vehicle |
| GET | `/vehicles/{id}/price-history` | Historical price changes |
| GET | `/vehicles/stats` | Inventory stats (counts, averages, ranges) |
| POST | `/trigger-sync` | Manually kick off the scrape + sync pipeline |
| GET | `/sync-status` | Last sync timestamp + summary |
| GET | `/sync-progress` | Real-time pipeline stage during active sync |
| GET | `/ml/summary` | Model metrics, feature importance |
| GET | `/ml/predictions` | All predictions (actual vs predicted) |
| GET | `/automation-log` | Scheduler status, next run, sync history |
| GET | `/health` | Health check |

**Example — GET /sync-status:**
```json
{
  "status": "completed",
  "last_sync": {
    "timestamp": "2026-02-13T13:27:04Z",
    "source": "manual",
    "total_scraped": 79,
    "added": 0,
    "updated": 3,
    "removed": 5,
    "unchanged": 76,
    "total_active": 79
  },
  "history": [...]
}
```

---

## ML Model — How It Works

### Features Used
- **Numerical:** year, mileage, vehicle_age (calculated), mileage_bin (bucketed)
- **Categorical (label-encoded):** make, model, trim, fuel_type, transmission, drivetrain, body_style
- **Derived:** vehicle_age = current_year - year, price_per_km = price / mileage

### Training Process
1. Filter out vehicles with missing or zero prices/mileage
2. Engineer features (age, price_per_km, mileage bins, encode categoricals)
3. Split 80/20 train/test. Scaler is fit **only on training data** (no data leakage)
4. Train all four models, evaluate on test set
5. Run 5-fold cross-validation for a more stable metric
6. Auto-select the model with the highest R² score
7. Serialize the trained model + encoders into MongoDB so it persists across restarts

### Models Trained
- **Linear Regression** — simple baseline
- **Random Forest** — handles non-linear relationships well
- **Gradient Boosting** — sequential ensemble, good for small datasets
- **XGBoost** — gradient boosting with regularization

### Metrics & What to Expect
With ~80 vehicles in the inventory, the dataset is small. The test set ends up being only ~16 cars, so the test-set R² can be unstable (sometimes negative — that just means those particular 16 cars were hard to predict). The **cross-validation R² (~0.55–0.60)** is the more reliable metric and shows the model is learning real pricing patterns.

MAE is typically around $3,000–4,000, meaning predictions are off by roughly 8-10% on average for cars priced $9K–$76K. Not bad for 80 data points.

---

## Automation — 24-Hour Sync

The sync is handled by APScheduler, built right into the FastAPI app. No external tools needed.

```python
# from app.py
scheduler.add_job(
    scheduled_sync,
    trigger=IntervalTrigger(hours=24),
    id="auto_sync",
    replace_existing=True,
)
```

**Every 24 hours, automatically:**
1. Scrapes all listings from the website
2. Compares against the database
3. Adds new vehicles, marks sold ones as removed, updates any changes
4. Retrains the ML model on the updated inventory
5. Generates fresh predictions for all active vehicles
6. Saves the model to MongoDB

**How to verify:**
- `GET /automation-log` — shows the scheduler is running, next scheduled run, and past sync history
- The dashboard has an "Automation Log" button that shows the same info visually
- `POST /trigger-sync` or the "Trigger Manual Sync" button runs the same pipeline on demand

The sync tracks exactly what changed — which vehicles were added, which were removed, and what fields were updated (with old vs new values). You can click any sync history row in the dashboard to expand the details.

See `automation_config.json` for the full workflow export.

---

## Dashboard Features

- **Overview tab:** inventory stats, price distribution chart, model breakdown (pie), year distribution, mileage vs price scatter, top deals
- **Vehicles tab:** searchable/sortable table with pagination, "Good Deal" / "Great Deal" tags for cars priced below prediction
- **Sync tab:** manual sync trigger with real-time 4-stage progress bar, sync history with expandable change details, automation log
- **ML tab:** model comparison table (MAE, RMSE, R², CV R²), actual vs predicted scatter chart, feature importance bar chart

---

## Deployment

### Backend (Render)
1. Create a new Web Service, connect the GitHub repo
2. Set root directory to `backend`, environment to Docker
3. Add environment variables: `MONGODB_URI`, `MONGODB_DB_NAME`, `ALLOWED_ORIGINS`
4. Render auto-deploys on every push to main

### Frontend (Vercel)
1. Import the repo, set root directory to `frontend`
2. Framework preset: Vite
3. Add env variable: `VITE_API_URL=https://audi-inventory-api.onrender.com`
4. Auto-deploys on push

### Keeping Render Alive
Render's free tier spins down after 15 minutes of inactivity. I use [cron-job.org](https://cron-job.org) to ping `/health` every 14 minutes so the backend stays warm.

---

## Assumptions & Limitations

- **Small dataset (~80 vehicles):** ML accuracy is limited but reasonable. Cross-validation R² around 0.55–0.60. More vehicles = better predictions over time.
- **French content:** The Audi West Island site is in French-Canadian. The scraper parses French labels and maps them to structured English field names.
- **Site-specific scraper:** Built for the current "One Audi Falcon" platform layout. If the dealership redesigns their site, the CSS selectors in `scraper.py` would need updating.
- **Single dealership:** Predictions are based only on this dealer's inventory, not broader market data. A larger dataset from multiple sources would improve the model.
- **Render cold starts:** First request after inactivity takes 30-60s while the container spins up. The cron ping minimizes this.
- **Price per km feature:** Only useful for vehicles with non-zero mileage. New cars (0 km) get clipped to avoid division by zero.

---

Built by Ayush
