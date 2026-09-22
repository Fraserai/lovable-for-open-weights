import asyncio
import json

import httpx

from trainloop.config import trainer_for
from trainloop.ingest import Chunk
from trainloop.synth import OPENAI_URL, OPENROUTER_URL, ZDR_PROVIDER, Generator, generate_rows
from trainloop.tinker import expand_per_assistant_turn, resolve_epochs


def test_small_datasets_get_more_epochs_capped_at_four():
    assert resolve_epochs(12) == 4       # 3 steps/epoch -> would need 84, capped
    assert resolve_epochs(1000) == 1     # 250 steps/epoch already hits the target
    assert resolve_epochs(600) == 2      # 150 steps/epoch -> 2 passes


def test_multi_turn_conversation_becomes_one_example_per_assistant_turn(tmp_path):
    src, dst = tmp_path / "in.jsonl", tmp_path / "out.jsonl"
    convo = [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"},
             {"role": "user", "content": "c"}, {"role": "assistant", "content": "d"}]
    single = [{"role": "user", "content": "x"}, {"role": "assistant", "content": "y"}]
    src.write_text(json.dumps({"messages": convo}) + "\n" + json.dumps({"messages": single}) + "\n")

    assert expand_per_assistant_turn(src, dst) == 3
    rows = [json.loads(l)["messages"] for l in dst.read_text().splitlines()]
    assert rows == [convo[:2], convo, single]  # each ends at the assistant turn it teaches


def test_trainer_routing():
    assert trainer_for("accounts/fireworks/models/glm-5p3-flash") == "fireworks"
    assert trainer_for("Qwen/Qwen3.5-4B") == "tinker"


def _run(provider: str):
    seen = []

    def handler(request: httpx.Request):
        body = json.loads(request.content)
        seen.append((str(request.url), body))
        name = body["response_format"]["json_schema"]["name"]
        content = {"system_prompt": "s"} if name == "system_prompt" else {"examples": [{"user": "q", "assistant": "a"}]}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    async def go():
        gen = Generator("k", "m", transport=httpx.MockTransport(handler), provider=provider)
        try:
            return await generate_rows(gen, [Chunk("f.pdf", "H", "text")], "goal", 1)
        finally:
            await gen.aclose()

    asyncio.run(go())
    return seen


def test_openrouter_is_always_pinned_to_zdr():
    for url, body in _run("openrouter"):
        assert url == OPENROUTER_URL and body["provider"] == ZDR_PROVIDER


def test_openai_uses_reasoning_effort_not_temperature():
    for url, body in _run("openai"):
        assert url == OPENAI_URL
        assert "provider" not in body and "temperature" not in body
        assert body["reasoning_effort"] == "low"
