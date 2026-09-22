import json

import httpx
import pytest

from trainloop.catalog import CatalogError, _context_to_tokens, _fireworks_models, build_catalog

FW_PAGE = """\
## Models

export const ModelsCatalog = () => {
  const TRAINING_SHAPES_CATALOG = {
    "generatedAt": "2026-09-12 18:38 UTC",
    "models": [{
      "model": "GLM 5.3 Flash",
      "id": "glm-5p3-flash",
      "managedSftLora": true,
      "managedDpoLora": true,
      "trainCtx": 65536,
      "paramCount": 320000000000,
      "flags": {}
    }, {
      "model": "Tiny Test 1B",
      "id": "tiny-test-1b",
      "managedSftLora": false,
      "managedDpoLora": false,
      "trainCtx": 16384,
      "paramCount": 1000000000,
      "flags": {}
    }]
  };
  const models = TRAINING_SHAPES_CATALOG.models ?? [];
};
"""

TINKER_JSON = json.dumps([
    {
        "name": "GLM-5.3 (256K)",
        "url": "https://huggingface.co/zai-org/GLM-5.3",
        "tinker_id": "zai-org/GLM-5.3:peft:262144",
        "params": 753000000000,
        "active_params": 40000000000,
        "context": "256K",
        "train": "$14.58",
    },
    {
        "name": "Inkling",
        "url": "https://huggingface.co/thinkingmachines/Inkling",
        "tinker_id": "thinkingmachines/Inkling",
        "params": 975000000000,
        "active_params": 41000000000,
        "context": "64K",
        "train": "$5.61",
    },
])


def mock_transport(fw_text: str, tinker_text: str) -> httpx.MockTransport:
    def handler(request: httpx.Request):
        body = fw_text if "fireworks.ai" in request.url.host else tinker_text
        return httpx.Response(200, text=body)

    return httpx.MockTransport(handler)


def entries_by_trainer(entries, trainer):
    return (e for e in entries if e["trainer"] == trainer)


def test_fireworks_parsing():
    entries = build_catalog(mock_transport(FW_PAGE, TINKER_JSON))
    fw = list(entries_by_trainer(entries, "fireworks"))
    assert [e["display_name"] for e in fw] == ["GLM 5.3 Flash", "Tiny Test 1B"]

    glm = fw[0]
    assert glm["trainer_model_id"] == "accounts/fireworks/models/glm-5p3-flash"
    assert glm["sft_lora"] is True and glm["dpo"] is True
    assert glm["train_context_tokens"] == 65536 and glm["params"] == 320000000000
    assert glm["hf_repo"] is None and glm["train_price"] is None

    tiny = fw[1]
    assert tiny["sft_lora"] is False and tiny["dpo"] is False


def test_tinker_parsing():
    entries = build_catalog(mock_transport(FW_PAGE, TINKER_JSON))
    tk = list(entries_by_trainer(entries, "tinker"))
    assert len(tk) == 2

    glm = tk[0]
    assert glm["trainer_model_id"] == "zai-org/GLM-5.3:peft:262144"
    assert glm["hf_repo"] == "zai-org/GLM-5.3"
    assert glm["train_context_tokens"] == 262144
    assert glm["params"] == 753000000000
    assert glm["train_price"] == "$14.58"
    assert glm["sft_lora"] is True and glm["dpo"] is None

    inkling = tk[1]
    assert inkling["train_context_tokens"] == 65536
    assert inkling["hf_repo"] == "thinkingmachines/Inkling"


def test_context_conversion():
    assert _context_to_tokens("64K") == 65536
    assert _context_to_tokens("256K") == 262144
    assert _context_to_tokens("32K") == 32768
    assert _context_to_tokens(65536) == 65536
    assert _context_to_tokens("not-a-size") is None
    assert _context_to_tokens(None) is None


def test_changed_fireworks_format_raises_clear_error():
    for bad in ("no catalog here", "const TRAINING_SHAPES_CATALOG = [1, 2]", "const TRAINING_SHAPES_CATALOG = {"):
        with pytest.raises(CatalogError, match="Fireworks page format changed"):
            _fireworks_models(bad)


def test_two_trainers_merged():
    entries = build_catalog(mock_transport(FW_PAGE, TINKER_JSON))
    assert [e["trainer"] for e in entries] == ["fireworks", "fireworks", "tinker", "tinker"]