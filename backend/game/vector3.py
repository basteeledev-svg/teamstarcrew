"""Minimal 3-D vector utilities (plain Python, no external deps)."""
import math


def v3(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> dict:
    return {"x": float(x), "y": float(y), "z": float(z)}


def magnitude(v: dict) -> float:
    return math.sqrt(v["x"] ** 2 + v["y"] ** 2 + v["z"] ** 2)


def normalize(v: dict) -> dict:
    mag = magnitude(v)
    if mag < 1e-9:
        return v3(0.0, 0.0, 1.0)
    return v3(v["x"] / mag, v["y"] / mag, v["z"] / mag)


def scale(v: dict, s: float) -> dict:
    return v3(v["x"] * s, v["y"] * s, v["z"] * s)


def add(a: dict, b: dict) -> dict:
    return v3(a["x"] + b["x"], a["y"] + b["y"], a["z"] + b["z"])


def dot(a: dict, b: dict) -> float:
    return a["x"] * b["x"] + a["y"] * b["y"] + a["z"] * b["z"]


def distance(a: dict, b: dict) -> float:
    return math.sqrt(
        (a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2 + (a["z"] - b["z"]) ** 2
    )


def rotate_toward(current: dict, target: dict, max_deg: float) -> dict:
    """Rotate *current* toward *target* by at most *max_deg* degrees.
    Uses normalised lerp (nlerp) — fast and good enough for a tick-based game."""
    cur = normalize(current)
    tgt = normalize(target)
    d = max(-1.0, min(1.0, dot(cur, tgt)))
    angle_deg = math.degrees(math.acos(d))
    if angle_deg < 0.001:
        return tgt
    t = min(1.0, max_deg / angle_deg)
    lerped = v3(
        cur["x"] + (tgt["x"] - cur["x"]) * t,
        cur["y"] + (tgt["y"] - cur["y"]) * t,
        cur["z"] + (tgt["z"] - cur["z"]) * t,
    )
    return normalize(lerped)
