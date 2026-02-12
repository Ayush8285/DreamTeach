import logging
import pickle
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import Optional
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from config import MIN_SAMPLES_FOR_TRAINING, TEST_SIZE, RANDOM_STATE, CV_FOLDS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VehiclePricePredictor:
    """Trains multiple regression models, picks the best one, and predicts vehicle prices."""

    def __init__(self):
        self.models = {}
        self.best_model = None
        self.best_model_name = ""
        self.label_encoders = {}
        self.scaler = StandardScaler()
        self.feature_columns = []
        self.metrics = {}
        self.is_trained = False
        self.training_timestamp = None

    def prepare_features(self, vehicles: list[dict], for_prediction=False) -> Optional[pd.DataFrame]:
        """Convert raw vehicle dicts into ML-ready features."""
        if not vehicles:
            return None

        df = pd.DataFrame(vehicles)

        required = ["year", "mileage"] if for_prediction else ["price", "year", "mileage"]
        for col in required:
            if col not in df.columns:
                logger.warning(f"Missing required column: {col}")
                return None

        if for_prediction:
            if "price" not in df.columns:
                df["price"] = 0
            df["price"] = df["price"].fillna(0)
            df["mileage"] = df["mileage"].fillna(0)
            df["year"] = df["year"].fillna(2020)
        else:
            df = df.dropna(subset=["price", "year", "mileage"])
            df = df[(df["price"] > 0) & (df["mileage"] > 0) & (df["year"] > 2000)]

        if not for_prediction and len(df) < MIN_SAMPLES_FOR_TRAINING:
            logger.warning(f"Insufficient samples: {len(df)} (need {MIN_SAMPLES_FOR_TRAINING})")
            return None

        # feature engineering
        current_year = datetime.now().year
        df["vehicle_age"] = current_year - df["year"]
        df["price_per_km"] = df["price"] / df["mileage"].clip(lower=1)
        df["mileage_bin"] = pd.cut(
            df["mileage"],
            bins=[0, 20000, 50000, 80000, 120000, 200000, float("inf")],
            labels=[0, 1, 2, 3, 4, 5],
        ).astype(int)

        # encode categoricals
        cat_cols = ["make", "model", "trim", "fuel_type",
                    "transmission", "drivetrain", "body_style"]
        for col in cat_cols:
            if col in df.columns:
                df[col] = df[col].fillna("Unknown").astype(str)
                if col not in self.label_encoders:
                    self.label_encoders[col] = LabelEncoder()
                    df[f"{col}_encoded"] = self.label_encoders[col].fit_transform(df[col])
                else:
                    le = self.label_encoders[col]
                    df[f"{col}_encoded"] = df[col].apply(
                        lambda x, _le=le: _le.transform([x])[0] if x in _le.classes_ else -1
                    )
            else:
                df[f"{col}_encoded"] = 0

        return df

    def train(self, vehicles: list[dict]) -> dict:
        """Train all models, evaluate, pick the best."""
        logger.info(f"Starting model training with {len(vehicles)} vehicles")

        df = self.prepare_features(vehicles)
        if df is None:
            return {"error": "Insufficient data for training"}

        self.feature_columns = [
            "year", "mileage", "vehicle_age", "mileage_bin",
            "make_encoded", "model_encoded", "trim_encoded",
            "fuel_type_encoded", "transmission_encoded",
            "drivetrain_encoded", "body_style_encoded",
        ]

        for col in self.feature_columns:
            if col not in df.columns:
                df[col] = 0

        X = df[self.feature_columns].values
        y = df["price"].values

        # split FIRST, then fit scaler on train only (prevents data leakage)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
        )
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        X_all_scaled = self.scaler.transform(X)

        # models to compare
        configs = {
            "Linear Regression": LinearRegression(),
            "Random Forest": RandomForestRegressor(
                n_estimators=100, random_state=RANDOM_STATE, n_jobs=-1,
            ),
            "Gradient Boosting": GradientBoostingRegressor(
                n_estimators=100, learning_rate=0.1, max_depth=4,
                random_state=RANDOM_STATE,
            ),
        }

        try:
            from xgboost import XGBRegressor
            configs["XGBoost"] = XGBRegressor(
                n_estimators=100, learning_rate=0.1, max_depth=4,
                min_child_weight=2, reg_alpha=0.1, reg_lambda=1.0,
                random_state=RANDOM_STATE, verbosity=0,
            )
        except ImportError:
            logger.warning("XGBoost not installed, skipping.")

        results = {}
        best_r2 = -float("inf")

        for name, model in configs.items():
            logger.info(f"Training {name}...")
            try:
                model.fit(X_train_scaled, y_train)
                y_pred = model.predict(X_test_scaled)

                mae = mean_absolute_error(y_test, y_pred)
                rmse = np.sqrt(mean_squared_error(y_test, y_pred))
                r2 = r2_score(y_test, y_pred)

                cv_folds = min(CV_FOLDS, len(X_all_scaled))
                if cv_folds >= 2:
                    cv = cross_val_score(model, X_all_scaled, y, cv=cv_folds, scoring="r2")
                    cv_mean, cv_std = cv.mean(), cv.std()
                else:
                    cv_mean, cv_std = r2, 0.0

                results[name] = {
                    "mae": round(mae, 2),
                    "rmse": round(rmse, 2),
                    "r2_score": round(r2, 4),
                    "cv_r2_mean": round(cv_mean, 4),
                    "cv_r2_std": round(cv_std, 4),
                }
                self.models[name] = model

                if r2 > best_r2:
                    best_r2 = r2
                    self.best_model = model
                    self.best_model_name = name

                logger.info(f"{name} - MAE: ${mae:,.2f}, RMSE: ${rmse:,.2f}, R²: {r2:.4f}")

            except Exception as e:
                logger.error(f"Error training {name}: {e}")
                results[name] = {"error": str(e)}

        importance = self._get_feature_importance()
        self.metrics = results
        self.is_trained = True
        self.training_timestamp = datetime.now(timezone.utc)

        return {
            "models": results,
            "best_model": self.best_model_name,
            "best_r2": round(best_r2, 4),
            "features_used": self.feature_columns,
            "feature_importance": importance,
            "training_samples": len(X_train),
            "test_samples": len(X_test),
            "total_samples": len(df),
            "timestamp": self.training_timestamp.isoformat(),
        }

    def predict(self, vehicle: dict) -> Optional[dict]:
        if not self.is_trained:
            return None

        df = self.prepare_features([vehicle], for_prediction=True)
        if df is None or len(df) == 0:
            return None

        for col in self.feature_columns:
            if col not in df.columns:
                df[col] = 0

        X = df[self.feature_columns].values
        X_scaled = self.scaler.transform(X)
        predicted = self.best_model.predict(X_scaled)[0]

        actual = vehicle.get("price", 0)
        diff = round(predicted - actual) if actual else None

        return {
            "predicted_price": round(predicted),
            "actual_price": actual,
            "price_difference": diff,
            "model_used": self.best_model_name,
            "confidence_metrics": self.metrics.get(self.best_model_name, {}),
        }

    def predict_batch(self, vehicles: list[dict]) -> dict:
        predictions = {}
        for v in vehicles:
            vin = v.get("vin")
            if vin:
                result = self.predict(v)
                if result:
                    predictions[vin] = result["predicted_price"]
        return predictions

    def _get_feature_importance(self) -> dict:
        if not self.best_model:
            return {}
        importance = {}
        try:
            if hasattr(self.best_model, "feature_importances_"):
                vals = self.best_model.feature_importances_
            elif hasattr(self.best_model, "coef_"):
                vals = np.abs(self.best_model.coef_)
            else:
                return {}

            for col, imp in zip(self.feature_columns, vals):
                importance[col] = round(float(imp), 4)
            importance = dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
        except Exception as e:
            logger.error(f"Error getting feature importance: {e}")
        return importance

    def serialize(self) -> bytes:
        return pickle.dumps({
            "best_model": self.best_model,
            "best_model_name": self.best_model_name,
            "models": self.models,
            "label_encoders": self.label_encoders,
            "scaler": self.scaler,
            "feature_columns": self.feature_columns,
            "metrics": self.metrics,
            "training_timestamp": self.training_timestamp,
        })

    def deserialize(self, data: bytes):
        loaded = pickle.loads(data)
        self.best_model = loaded["best_model"]
        self.best_model_name = loaded["best_model_name"]
        self.models = loaded["models"]
        self.label_encoders = loaded["label_encoders"]
        self.scaler = loaded["scaler"]
        self.feature_columns = loaded["feature_columns"]
        self.metrics = loaded["metrics"]
        self.training_timestamp = loaded["training_timestamp"]
        self.is_trained = True
        logger.info(f"Model loaded: {self.best_model_name} (trained at {self.training_timestamp})")

    def get_model_summary(self) -> dict:
        return {
            "is_trained": self.is_trained,
            "best_model": self.best_model_name,
            "models_trained": list(self.metrics.keys()),
            "metrics": self.metrics,
            "features": self.feature_columns,
            "feature_importance": self._get_feature_importance(),
            "training_timestamp": self.training_timestamp.isoformat() if self.training_timestamp else None,
        }
