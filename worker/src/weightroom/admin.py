"""Operator commands, run on the server (e.g. `railway run python -m weightroom.admin ...`).

    python -m weightroom.admin new-secrets            # values for SECRET_KEY and ENCRYPTION_KEY
    python -m weightroom.admin grant you@x.com 50     # add credits by hand (testing, goodwill)
    python -m weightroom.admin set-plan you@x.com pro # change a plan without Stripe (e.g. Enterprise deals)
    python -m weightroom.admin jobs                   # the latest jobs across all accounts
"""

import secrets
import sys

from sqlalchemy import select

from . import credits, db


def _account(s, email: str) -> db.Account:
    account = s.scalar(select(db.Account).where(db.Account.email == email.strip().lower()))
    if account is None:
        sys.exit(f"No account for {email}.")
    return account


def main(argv: list[str]) -> None:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    cmd, args = argv[0], argv[1:]
    if cmd == "new-secrets":
        from cryptography.fernet import Fernet

        print(f"SECRET_KEY={secrets.token_urlsafe(48)}\nENCRYPTION_KEY={Fernet.generate_key().decode()}")
        return
    db.init()
    with db.session() as s:
        if cmd == "grant" and len(args) == 2:
            account = _account(s, args[0])
            credits.add(s, account.id, int(args[1]), "adjust", note="Granted by operator")
            print(f"{account.email}: balance {credits.balance(s, account.id)} credits")
        elif cmd == "set-plan" and len(args) == 2 and args[1] in credits.PLANS:
            account = _account(s, args[0])
            account.plan = args[1]
            print(f"{account.email}: plan {account.plan}")
        elif cmd == "jobs":
            for j in s.scalars(select(db.Job).order_by(db.Job.created_at.desc()).limit(30)):
                print(f"{j.id}  {j.state:9} {j.step}/{j.total_steps:<5} {j.credits:>4} cr  {j.base_model}  "
                      f"{(j.error or (j.scorecard or {}).get('summary') or '')[:90]}")
        else:
            sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
