import json

from trainloop import evidence as ev


def make_run(tmp_path, **state):
    run = tmp_path / "acme"
    run.mkdir()
    (run / "train.jsonl").write_text('{"messages": []}\n')
    base = {"name": "acme", "goal": "Triage messages", "base_model": "moonshotai/Kimi-K2.6", "trainer": "tinker",
            "rows": 10, "system_prompt": "Classify.", "source": {"hf": None, "file": "data.jsonl"}}
    return run, {**base, **state}


def test_pack_names_the_publisher_and_never_guesses_a_trainer_region(tmp_path):
    run, state = make_run(tmp_path)
    pack = ev.build(run, state)
    assert pack["inventory"]["Weights publisher"] == "Moonshot AI (China)"
    trained = next(f for f in pack["data_flows"] if f["step"] == "Model trained")
    assert trained["region"] == ev.UNSTATED
    assert pack["fingerprints"][0]["file"] == "train.jsonl"
    assert "not been downloaded" in pack["exit_plan"][0]


def test_private_scoring_is_recorded_as_zero_retention(tmp_path):
    run, state = make_run(tmp_path, job_state="JOB_STATE_COMPLETED")
    (run / "scorecard.json").write_text(json.dumps({"metric": "exact", "examples": 200, "frontier_model": "openai/gpt-6-astra",
        "public": False, "contenders": {"trained": {"score": 0.92, "correct": 184}, "frontier": {"score": 0.9, "correct": 180}}}))
    pack = ev.build(run, state)
    frontier = next(f for f in pack["data_flows"] if f["step"].startswith("Scored"))
    assert frontier["retention"] == ev.ZDR
    assert pack["scorecard"]["verdict"] == "Your model beats openai/gpt-6-astra by 2.0 points."
    assert "<script" not in ev.render_html(pack)


def test_openai_example_writer_is_flagged(tmp_path):
    run, state = make_run(tmp_path, documents=["pds.pdf"], generator_provider="openai", generator_model="gpt-5-mini")
    writer = next(f for f in ev.build(run, state)["data_flows"] if f["step"] == "Training examples written")
    assert "30 days" in writer["retention"]


def test_user_text_is_escaped(tmp_path):
    run, state = make_run(tmp_path, goal="<script>alert(1)</script>")
    assert "<script>alert" not in ev.render_html(ev.build(run, state))
