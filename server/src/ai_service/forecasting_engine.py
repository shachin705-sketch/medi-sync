"""
MediSync PHC - Python AI Time-Series Forecasting & Anomaly Detection Service
Standalone Service for Production Microservice Deployment (FastAPI / Statsmodels / Scikit-learn)
"""

import math
from typing import List, Dict, Any, Optional

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance in kilometers using the Haversine formula."""
    if lat1 == lat2 and lon1 == lon2:
        return 0.0
    R = 6371.0 # Earth radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 1)

def detect_consumption_anomalies(history_series: List[float], threshold_z: float = 2.0) -> Dict[str, Any]:
    """Z-score statistical anomaly detection on 30-day daily consumption."""
    if len(history_series) < 7:
        return {"has_anomaly": False, "z_score": 0.0}

    mean = sum(history_series) / len(history_series)
    variance = sum((x - mean) ** 2 for x in history_series) / len(history_series)
    std_dev = math.sqrt(variance)

    latest = history_series[-1]
    z_score = (latest - mean) / std_dev if std_dev > 0 else 0.0

    return {
        "has_anomaly": z_score >= threshold_z or (mean > 5 and latest >= mean * 2),
        "latest_dispensed": latest,
        "mean_baseline": round(mean, 1),
        "std_dev": round(std_dev, 1),
        "z_score": round(z_score, 2),
        "severity": "critical" if z_score > 3.0 else ("warning" if z_score >= 2.0 else "normal")
    }

def seasonal_epidemiology_multiplier(category: str, medicine_name: str, month: int) -> float:
    """Tamil Nadu seasonal demand adjustments (Monsoon vs Summer heatwave)."""
    name = medicine_name.lower()
    if 10 <= month <= 12: # Oct-Dec Northeast Monsoon
        if "paracetamol" in name or "amoxicillin" in name or "cetirizine" in name:
            return 1.55 # Fever/flu surge
        if "snake" in name or "asv" in name:
            return 1.45 # Flooding agricultural snakebites
    elif 4 <= month <= 6: # Summer peak (Agni Nakshatram)
        if "ors" in name or "zinc" in name:
            return 1.65 # Diarrhea / dehydration
    return 1.0

def predict_runout_date(current_stock: float, history_series: List[float], seasonal_factor: float = 1.0) -> Dict[str, Any]:
    """Exponential smoothing time-series forecast to predict exact run-out date."""
    if not history_series:
        return {"days_left": 999, "forecasted_daily_rate": 0.0}

    alpha = 0.35
    smoothed = history_series[0]
    for val in history_series:
        smoothed = alpha * val + (1 - alpha) * smoothed

    forecasted_daily = max(0.1, smoothed * seasonal_factor)
    days_left = round(current_stock / forecasted_daily, 1)

    return {
        "current_stock": current_stock,
        "forecasted_daily_consumption": round(forecasted_daily, 1),
        "projected_days_left": days_left,
        "status": "red" if days_left < 15 else ("amber" if days_left <= 30 else "green")
    }

if __name__ == "__main__":
    sample_history = [12, 14, 15, 13, 14, 16, 15, 14, 17, 16, 38] # Sudden spike on day 11
    anomaly = detect_consumption_anomalies(sample_history)
    print("Anomaly Detection Test:", anomaly)
    forecast = predict_runout_date(8, sample_history, seasonal_factor=1.5)
    print("Runout Prediction Test (8 bottles left):", forecast)
