# Security and production operation

This repository is a workflow tool for licensed-professional review. It must
not be operated as an automated eligibility, pricing, detention, identity, or
release decision service.

Before production use, configure a managed secret store, HTTPS, a restricted
`BAILBONDS_ALLOWED_ORIGIN`, authenticated notification provider, encrypted and
backed-up database volume, least-privilege platform access, and a documented
incident-response contact. Set `BAILBONDS_ENABLE_HSTS=1` only on an HTTPS host.

The public Pages site must contain no client, booking, staff, license, or
operational information. Authorized staff access must remain separately
authenticated. Do not bypass CAPTCHA or scrape a source that requires human
verification. Report suspected vulnerabilities privately to the repository
owner; do not place sensitive records in issues, commits, or screenshots.
