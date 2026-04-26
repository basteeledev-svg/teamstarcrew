"""Feedback endpoints — collect user ratings and comments."""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback", tags=["feedback"])

# Store feedback in a JSON-lines file next to the backend
_FEEDBACK_FILE = Path(__file__).resolve().parent.parent / "feedback.jsonl"


class FeedbackRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=50)
    rating: int = Field(..., ge=-1, le=1)  # -1 dislike, 0 neutral, 1 like
    comment: Optional[str] = Field(None, max_length=2000)
    theme_id: Optional[str] = Field(None, max_length=100)
    theme_vars: Optional[dict] = None


@router.post("")
async def submit_feedback(req: FeedbackRequest):
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "category": req.category,
        "rating": req.rating,
        "comment": req.comment,
        "theme_id": req.theme_id,
        "theme_vars": req.theme_vars,
    }
    try:
        with open(_FEEDBACK_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        logger.exception("Failed to write feedback")
        return {"status": "error", "detail": "Could not save feedback"}
    return {"status": "ok"}


@router.get("")
async def list_feedback():
    if not _FEEDBACK_FILE.exists():
        return {"feedback": []}
    entries = []
    with open(_FEEDBACK_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return {"feedback": entries}
