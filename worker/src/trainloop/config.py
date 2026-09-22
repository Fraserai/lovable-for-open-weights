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
    default = DEFAULT_OPENAI_GENERATOR_MODEL if generator_provider() == "openai" else DEFAULT_GENERATOR_MODEL
    return os.environ.get("GENERATOR_MODEL", "").strip() or default


# OpenRouter pinned to zero-data-retention providers is the default. OpenAI is opt-in
# (GENERATOR_PROVIDER=openai) and only for test or public documents: its API keeps data
# for up to 30 days unless the account has a zero-retention agreement.
DEFAULT_OPENAI_GENERATOR_MODEL = "gpt-5-mini"


def generator_provider() -> str:
    provider = os.environ.get("GENERATOR_PROVIDER", "").strip().lower() or "openrouter"
    if provider not in ("openrouter", "openai"):
        raise MissingConfig(f"GENERATOR_PROVIDER must be openrouter or openai, not {provider!r}.")
    return provider


def trainer_for(base_model: str) -> str:
    """Fireworks models are named accounts/<acct>/models/<id>; Tinker uses Hugging Face ids."""
    return "fireworks" if base_model.startswith("accounts/") else "tinker"
