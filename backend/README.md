# Tulsa workflow backend

This service is the human-in-the-loop backend for the Tulsa MVP. It accepts a
consented intake, records an auditable polling request, normalizes source
matches, produces an explainable review packet, and lets an authenticated
bondsman enter the final decision and fee offer.

The service deliberately does not make a bail decision, identify a person from
a mugshot, or calculate a legally binding fee without bondsman input.

Run locally:

```bash
python3 backend/server.py
```

Environment:

- `BAILBONDS_ADMIN_TOKEN`: bearer token for bondsman/admin endpoints
- `BAILBONDS_ADMIN_EMAIL`: bootstrap operator email for portal login
- `BAILBONDS_ADMIN_PASSWORD_HASH`: PBKDF2 hash generated with `python3 -m backend.create_admin`
- `BAILBONDS_DB`: SQLite path (default `backend/data.sqlite3`)
- `TULSA_INMATE_API_URL`: optional inmate API base URL
- `OSCN_SERVICE_URL`: optional internal OSCN worker URL

The portal login creates a 12-hour server-side session. Keep the legacy admin
token only for controlled migration; new clients should use `/api/auth/login`.

ADTV can credit a request through `POST /api/adtv/revenue` using an
`ADTV-Signature: t=<unix>,v1=<hmac>` header. The payload must include a unique
`event_id`, `request_id`, and positive `usd_cents`. Clients can view and spend
the resulting BBT balance through their approved public share link at
`/api/public/shares/<token>/prepay`.

For production, replace SQLite with encrypted managed storage, put the service
behind TLS and an identity provider, and obtain written authorization and a
retention policy for every records source.
