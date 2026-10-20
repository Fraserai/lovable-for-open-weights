"""Stripe webhooks grant credits exactly once, plans follow subscriptions, and free credits refill monthly."""

import json
from datetime import timedelta

import pytest
from sqlalchemy import select


@pytest.fixture
def stripe_on(client, monkeypatch):
    import stripe

    from weightroom import config

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_x")
    monkeypatch.setenv("STRIPE_PRICE_PRO", "price_pro")
    monkeypatch.setenv("STRIPE_PRICE_BUSINESS", "price_biz")
    monkeypatch.setenv("STRIPE_PRICE_TOPUP", "price_topup")
    config.reload()
    seen = {}

    def construct(payload, sig, secret):
        if sig != "good":
            raise ValueError("bad signature")
        seen["secret"] = secret
        return json.loads(payload)
    monkeypatch.setattr(stripe.Webhook, "construct_event", staticmethod(construct))
    return client


def _account():
    from weightroom import db

    with db.session() as s:
        acct = s.scalar(select(db.Account))
        s.expunge(acct)
        return acct


def _send(client, event: dict, sig="good"):
    return client.post("/stripe/webhook", content=json.dumps(event), headers={"stripe-signature": sig})


def _signup(client):
    client.post("/account/signup", json={"email": "pay@example.com", "password": "correct horse battery"})
    from weightroom import db

    with db.session() as s:
        s.scalar(select(db.Account)).stripe_customer_id = "cus_1"


def test_bad_signature_is_rejected(stripe_on):
    assert _send(stripe_on, {"type": "invoice.paid"}, sig="forged").status_code == 400


def test_subscription_then_monthly_credits_once(stripe_on):
    client = stripe_on
    _signup(client)
    acct = _account()
    done = {"type": "checkout.session.completed", "data": {"object": {
        "id": "cs_1", "customer": "cus_1", "subscription": "sub_1", "client_reference_id": acct.id,
        "metadata": {"account_id": acct.id, "item": "pro"}, "payment_status": "paid"}}}
    assert _send(client, done).json()["result"] == "plan pro"
    invoice = {"type": "invoice.paid", "data": {"object": {
        "id": "in_1", "customer": "cus_1", "lines": {"data": [{"pricing": {"price_details": {"price": "price_pro"}}}]}}}}
    assert _send(client, invoice).status_code == 200
    assert _send(client, invoice).status_code == 200  # Stripe retries; no double grant
    me = client.get("/account/me").json()
    assert me["plan"] == "pro" and me["balance_credits"] == 10 + 100

    renewal = {**invoice, "data": {"object": {**invoice["data"]["object"], "id": "in_2"}}}
    _send(client, renewal)
    assert client.get("/account/me").json()["balance_credits"] == 210


def test_topup_once_and_only_on_paid_plans(stripe_on):
    client = stripe_on
    _signup(client)
    acct = _account()
    r = client.post("/account/checkout", json={"item": "topup"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "plan_required"

    topup = {"type": "checkout.session.completed", "data": {"object": {
        "id": "cs_9", "customer": "cus_1", "metadata": {"account_id": acct.id, "item": "topup"},
        "payment_status": "paid"}}}
    _send(client, topup)
    _send(client, topup)
    assert client.get("/account/me").json()["balance_credits"] == 110


def test_cancelled_subscription_goes_back_to_free(stripe_on):
    client = stripe_on
    _signup(client)
    from weightroom import db

    with db.session() as s:
        s.scalar(select(db.Account)).plan = "business"
    _send(client, {"type": "customer.subscription.updated", "data": {"object": {
        "id": "sub_1", "customer": "cus_1", "status": "active", "items": {"data": [{"price": {"id": "price_pro"}}]}}}})
    assert client.get("/account/me").json()["plan"] == "pro"
    _send(client, {"type": "customer.subscription.deleted", "data": {"object": {"id": "sub_1", "customer": "cus_1"}}})
    assert client.get("/account/me").json()["plan"] == "free"


def test_billing_off_says_so(client):
    client.post("/account/signup", json={"email": "x@example.com", "password": "correct horse battery"})
    r = client.post("/account/checkout", json={"item": "pro"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "billing_not_configured"


def test_free_credits_refill_monthly_without_rollover(client):
    from weightroom import credits, db

    client.post("/account/signup", json={"email": "f@example.com", "password": "correct horse battery"})
    with db.session() as s:
        acct = s.scalar(select(db.Account))
        credits.add(s, acct.id, -7, "train")
    assert client.get("/account/me").json()["balance_credits"] == 3
    with db.session() as s:
        s.scalar(select(db.Account)).free_grant_at = db.now() - timedelta(days=31)
    assert client.get("/account/me").json()["balance_credits"] == 10
    assert client.get("/account/me").json()["balance_credits"] == 10  # once per month


def test_login_and_cookie_guard(client):
    client.post("/account/signup", json={"email": "l@example.com", "password": "correct horse battery"})
    client.post("/account/logout", json={})
    assert client.post("/account/login", json={"email": "l@example.com", "password": "wrong password!"}).status_code == 401
    assert client.post("/account/login", json={"email": "l@example.com", "password": "correct horse battery"}).status_code == 200
    # a cross-site form post can't create keys with the login cookie
    r = client.post("/account/keys", data={"name": "evil"})
    assert r.status_code in (415, 422)
