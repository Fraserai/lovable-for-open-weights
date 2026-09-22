import os
from pathlib import Path

from dotenv import load_dotenv

# .env lives at the repo root, one level above worker/
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

DEFAULT_BASE_MODEL = "accounts/fireworks/models/glm-5p3-flash"
DEFAULT_GENERATOR_MODEL = "z-ai/glm-5.3"

# Max training context for GLM-5.3-Flash managed SFT (Fireworks training catalog, Sept 2026)
BASE_MODEL_TRAIN_CTX = {DEFAULT_BASE_MODEL: 65536}
# Matching public checkpoint, used in the model card
BASE_MODEL_HF_ID = {DEFAULT_BASE_MODEL: "zai-org/GLM-5.3-Flash"}

RUNS_DIR = Path(__file__).resolve().parents[3] / "runs"


class MissingConfig(RuntimeError):
    pass


def require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise MissingConfig(f"{name} is not set. Add it to .env at the repo root (see .env.example).")
    return value


def generator_model() -> str:
    return os.environ.get("GENERATOR_MODEL", "").strip() or DEFAULT_GENERATOR_MODEL
