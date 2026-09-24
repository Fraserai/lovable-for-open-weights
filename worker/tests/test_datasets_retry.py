import httpx
import pytest

from trainloop import datasets


def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_hub_import_rides_out_a_temporary_502(monkeypatch):
    monkeypatch.setattr(datasets.time, "sleep", lambda s: None)
    calls = {"rows": 0}

    def handler(request: httpx.Request):
        if request.url.path.endswith("/splits"):
            return httpx.Response(200, json={"splits": [{"config": "default", "split": "train"}]})
        calls["rows"] += 1
        if calls["rows"] == 1:
            return httpx.Response(502, text="bad gateway")
        return httpx.Response(200, json={"rows": [{"row": {"question": "Q?", "answer": "A."}}]})

    rows = list(datasets.from_hub("owner/data", limit=1, client=_client(handler)))
    assert rows == [[{"role": "user", "content": "Q?"}, {"role": "assistant", "content": "A."}]]
    assert calls["rows"] == 2


def test_hub_import_gives_up_after_retries(monkeypatch):
    monkeypatch.setattr(datasets.time, "sleep", lambda s: None)

    def handler(request: httpx.Request):
        if request.url.path.endswith("/splits"):
            return httpx.Response(200, json={"splits": [{"config": "default", "split": "train"}]})
        return httpx.Response(503, text="down")

    with pytest.raises(datasets.DatasetError, match="503"):
        list(datasets.from_hub("owner/data", limit=1, client=_client(handler)))


def test_a_real_client_error_is_not_retried(monkeypatch):
    slept = []
    monkeypatch.setattr(datasets.time, "sleep", slept.append)
    handler = lambda request: httpx.Response(404, text="no such dataset")  # noqa: E731
    with pytest.raises(datasets.DatasetError, match="404"):
        list(datasets.from_hub("owner/missing", limit=1, client=_client(handler)))
    assert slept == []
