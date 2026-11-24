from datetime import datetime, timezone
from random import uniform
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ROBOFORGE X Simulation API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"]
)

@app.get("/api/health")
def health():
    return {"status": "online", "service": "roboforge-x-api", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/api/telemetry")
def telemetry():
    return {
        "robot_id": "RF-06",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mode": "simulation",
        "joints": [{"joint": f"J{i}", "angle_deg": round(uniform(-70, 70), 2), "temperature_c": round(uniform(28, 48), 1)} for i in range(1, 7)],
        "end_effector_load_kg": round(uniform(0.1, 1.8), 2),
        "warning": "Synthetic demonstration telemetry; no physical robot is connected."
    }

@app.post("/api/plan")
def plan(payload: dict):
    target = payload.get("target", {})
    return {
        "accepted": True,
        "target": target,
        "planner": "demo-placeholder",
        "message": "Request received. This endpoint does not calculate a validated robot trajectory."
    }
