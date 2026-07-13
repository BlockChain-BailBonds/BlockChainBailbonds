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
- `BAILBONDS_DB`: SQLite path (default `backend/data.sqlite3`)
- `TULSA_INMATE_API_URL`: optional inmate API base URL
- `OSCN_SERVICE_URL`: optional internal OSCN worker URL

For production, replace SQLite with encrypted managed storage, put the service
behind TLS and an identity provider, and obtain written authorization and a
retention policy for every records source.
