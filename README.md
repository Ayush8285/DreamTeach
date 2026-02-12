# Audi West Island — Inventory Scraping, Database Sync & ML Price Prediction

**DreamTech AI Solutions — Hiring Assignment**

End-to-end data pipeline that scrapes used car inventory from [Audi West Island](https://www.audiwestisland.com/fr/inventaire/occasion/), stores it in MongoDB, and uses ML to predict vehicle prices. Includes a React dashboard for visualization.

## Architecture

```
┌──────────────────┐         ┌──────────────────────────────┐
│   VERCEL          │  API    │   RENDER                      │
│                   │ calls   │                               │
│  React Frontend  │◄───────►│  FastAPI Backend               │
│  - Dashboard     │         │  ├─ Playwright (scraper.py)    │
│  - Vehicle list  │         │  ├─ MongoDB sync (database.py) │
│  - Charts        │         │  ├─ ML Models (ml_model.py)    │
│  - Search/Filter │         │  ├─ REST API (api.py)          │
│                   │         │  └─ APScheduler (24hr cron)    │
└──────────────────┘         └──────────────┬─────────────────┘
                                            │
                                   ┌────────▼────────┐
                                   │  MongoDB Atlas   │
                                   │  (Cloud DB)      │
                                   └─────────────────┘
```

**Flow:** Scrape → Parse & Clean → MongoDB → Train ML → Predict Prices → REST API → Dashboard

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Web Scraping | Playwright (headless Chromium) |
| Database | MongoDB Atlas (PyMongo) |
| ML Models | scikit-learn, XGBoost, Gradient Boosting |
| API | FastAPI + Uvicorn |
| Frontend | React + Vite + Tailwind CSS + Recharts |
| Scheduler | APScheduler (24-hour interval) |
| Backend Hosting | Render |
| Frontend Hosting | Vercel |
| Containerization | Docker |

## Features

- **Web Scraping**: Playwright handles the JS-rendered "One Audi Falcon" platform, clicks through pagination, and extracts vehicle data
- **Database Sync**: Adds new vehicles, marks removed ones as inactive, updates price changes, and tracks price history
- **ML Price Prediction**: Trains 4 models (Linear Regression, Random Forest, XGBoost, Gradient Boosting), picks the best by R² score
- **REST API**: Search, filter, predictions, sync control, health monitoring
- **24-Hour Automation**: APScheduler runs the full pipeline (scrape → sync → retrain → predict) every 24 hours
- **Feature Engineering**: Vehicle age, price per km, mileage bins, categorical encoding for make/model/trim
- **Interactive Dashboard**: Price distribution, model breakdown, mileage vs price scatter, year distribution, top deals, actual vs predicted charts

## Project Structure

```
DreamTechAISolutions/
├── backend/
│   ├── app.py              # Entry point + scheduler
│   ├── scraper.py          # Playwright scraping
│   ├── database.py         # MongoDB connection + sync
│   ├── ml_model.py         # ML training + prediction
│   ├── api.py              # FastAPI endpoints
│   ├── config.py           # Config + env vars
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── VehicleTable.jsx
│   │   │   ├── SearchFilter.jsx
│   │   │   ├── SyncStatus.jsx
│   │   │   └── MLMetrics.jsx
│   │   ├── lib/api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── vercel.json
└── README.md
```

## Setup

### Backend

```bash
cd backend

python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# fill in your MongoDB Atlas URI

python app.py
# API at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install

cp .env.example .env
# set VITE_API_URL=http://localhost:8000

npm run dev
# Dashboard at http://localhost:5173
```

### Docker (optional)

```bash
cd backend
docker build -t audi-inventory-api .
docker run -p 8000:8000 --env-file .env audi-inventory-api
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/vehicles` | All active vehicles |
| `GET` | `/vehicles/{id}` | Single vehicle by VIN |
| `GET` | `/vehicles/{id}/predict` | ML price prediction |
| `GET` | `/vehicles/{id}/price-history` | Price change history |
| `GET` | `/vehicles/search` | Search with filters |
| `GET` | `/vehicles/stats` | Inventory statistics |
| `GET` | `/sync-status` | Last sync info |
| `POST` | `/trigger-sync` | Manual sync trigger |
| `GET` | `/ml/summary` | ML model metrics |
| `GET` | `/ml/predictions` | All predictions |
| `GET` | `/automation-log` | Scheduler status |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI |

### Example Responses

**GET /vehicles**
```json
{
  "total": 84,
  "vehicles": [
    {
      "vin": "WA125AGU4S2047820",
      "title": "2025 Audi Q5 SUV Progressiv 45 TFSI quattro tiptronic",
      "price": 47995,
      "predicted_price": 46800,
      "price_difference": -1195,
      "mileage": 25340,
      "year": 2025,
      "make": "Audi",
      "model": "Q5",
      "fuel_type": "Essence",
      "transmission": "Automatique",
      "status": "active"
    }
  ]
}
```

**GET /sync-status**
```json
{
  "status": "completed",
  "last_sync": {
    "timestamp": "2026-02-12T00:00:00Z",
    "added": 3,
    "updated": 2,
    "removed": 1,
    "total_active": 84
  }
}
```

## ML Model Details

### Features
- **Numerical**: year, mileage, vehicle_age, mileage_bin
- **Categorical** (label-encoded): make, model, trim, fuel_type, transmission, drivetrain, body_style
- **Derived**: vehicle_age (current_year - year), price_per_km, mileage bins

### Models
1. **Linear Regression** — baseline
2. **Random Forest** — robust on small datasets
3. **Gradient Boosting** — sequential ensemble learning
4. **XGBoost** — gradient boosting with regularization

### Evaluation
- K-Fold Cross Validation (K=5)
- Metrics: MAE, RMSE, R² Score
- Best model auto-selected by R² on test set
- Feature importance displayed in dashboard

With ~80 vehicles in inventory, R² between 0.6–0.9 is expected. The scaler is fit only on training data to prevent data leakage.

## Automation (24-Hour Sync)

The automation is handled by **APScheduler** (`AsyncIOScheduler`), built directly into the FastAPI app. No external tools needed — it starts automatically when the backend runs.

**How it works** (in `app.py`):
```python
scheduler.add_job(
    scheduled_sync,
    trigger=IntervalTrigger(hours=24),
    id="auto_sync",
    replace_existing=True,
)
scheduler.start()
```

**Every 24 hours, the pipeline runs automatically:**
1. Scrape all listings with Playwright
2. Compare with existing database records
3. Sync: add new, remove delisted, update changed
4. Retrain ML model on updated data
5. Generate predictions for all active vehicles
6. Serialize and save trained model to MongoDB

**Verify it's running:**
- `GET /automation-log` — shows scheduler status, next run time, and sync history
- Dashboard → Sync Status tab → "Automation Log" button

**Manual trigger also available:**
- `POST /trigger-sync` — runs the same pipeline on demand
- Dashboard → Sync Status tab → "Trigger Manual Sync" button

## Deployment

### Backend (Render)
1. New Web Service → connect GitHub repo
2. Root directory: `backend`
3. Build: `pip install -r requirements.txt && playwright install chromium && playwright install-deps chromium`
4. Start: `python app.py`
5. Add env vars from `.env.example`

### Frontend (Vercel)
1. Import project → root directory: `frontend`
2. Framework: Vite
3. Env: `VITE_API_URL=https://your-render-app.onrender.com`

## Limitations

- **Small Dataset**: ~80 vehicles limits ML accuracy, but results are reasonable for the use case
- **Site Structure**: Scraper is built for the current Audi West Island layout. A redesign would require selector updates
- **French Content**: The site is in French-Canadian; the scraper maps French labels to structured fields
- **Render Free Tier**: Cold starts take 30-60s after inactivity
- **Predictions**: Based on current inventory only, not broader market data

---

Built for DreamTech AI Solutions
