# Staging (client test environment) on the VPS

Runs on the Hetzner VPS behind the existing Traefik, using the existing Postgres container.

| URL                                   | What                                          |
| ------------------------------------- | --------------------------------------------- |
| https://drazbe.49.12.206.130.sslip.io | the app                                       |
| https://mail.49.12.206.130.sslip.io   | test inbox: every email the app sends (OTP!)  |
| https://s3.49.12.206.130.sslip.io     | file storage (used by the app, not by people) |

`sslip.io` maps `<name>.49.12.206.130.sslip.io` to the IP, so no DNS is needed and Traefik can
still get Let's Encrypt certificates. For a real domain later, point A records at the VPS and
change `APP_HOST` / `S3_HOST` / `MAIL_HOST` in `.env.staging`.

Stack (`docker-compose.staging.yml`): `migrate` (one-shot) → `web` + `worker`, `rustfs` + `s3-init`
(S3), `mailpit` (catches all mail; nothing is sent to real addresses), optional `dss`.

## 1. One-time setup

```sh
# On the VPS
git clone git@github.com:mato28/drazbe.git ~/drazbe && cd ~/drazbe
cp .env.staging.example .env.staging
```

Look up the values for `.env.staging`:

```sh
docker network ls                                     # TRAEFIK_NETWORK, POSTGRES_NETWORK
docker ps --format '{{.Names}}\t{{.Networks}}'        # Postgres container name = DB host
docker inspect <traefik-container> | grep -iE 'entrypoints|certresolver|certificatesresolvers'
#   -> TRAEFIK_ENTRYPOINT (often websecure / https), TRAEFIK_CERTRESOLVER (often letsencrypt / le)
```

Create the database and user in the existing Postgres (password: `openssl rand -hex 24`):

```sh
docker exec -it <postgres-container> psql -U postgres -c "CREATE ROLE domik_staging LOGIN PASSWORD '<pw>';" \
  -c "CREATE DATABASE domik_staging OWNER domik_staging;"
```

Fill in the remaining secrets (`openssl rand -base64 32` for `BETTER_AUTH_SECRET`,
`openssl rand -hex 16/32` for the S3 keys), `MAILPIT_UI_AUTH=user:password` and `SEED_PASSWORD`.

Postgres must use UTC; the app always writes `timestamptz`, so the server setting only affects
`psql` output.

## 2. Deploy / update

```sh
cd ~/drazbe && git pull
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f web worker
```

Migrations run automatically (`migrate` service) before web and worker start. The Next.js
build needs about 2 GB RAM. On a small VPS, add swap or build the images in CI later.

Alias it:

```sh
alias dstg='docker compose --env-file .env.staging -f docker-compose.staging.yml'
```

## 3. Test accounts

Once, after the first deploy:

```sh
dstg run --rm migrate node dist/cli/seed.js
```

| Role        | Email                  | Notes                               |
| ----------- | ---------------------- | ----------------------------------- |
| Admin       | admin@domik.local      | admin area is still empty           |
| Trustee     | upravitelj@domik.local | case + 3 lots, 2 published auctions |
| Bidder (FO) | drazitelj1@domik.local | identity verified                   |
| Bidder (PO) | drazitelj2@domik.local | company, identity verified          |

Password for all: `SEED_PASSWORD`. The client can also **register new bidder accounts** with any
email. The OTP code appears in the test inbox (mail.…). The trustee then reviews the identity
and the application under _Upravitelj → Prijave_.

A live auction that starts in ~1 minute with both seeded bidders approved:

```sh
dstg run --rm migrate node dist/cli/demo-auction.js asc 600   # or: desc | desc-switch | preemption
```

Open it in two browsers (bidder 1 and bidder 2) to see live bidding.

## 4. Reset / other

```sh
# Wipe all staging data and start over (drops the DB schema, then deploy + seed again)
docker exec -it <postgres-container> psql -U postgres -c "DROP DATABASE domik_staging WITH (FORCE);" \
  -c "CREATE DATABASE domik_staging OWNER domik_staging;"
dstg up -d --force-recreate migrate web worker && dstg run --rm migrate node dist/cli/seed.js

# Verify an auction's bid hash chain
dstg exec worker node dist/cli/verify-auction.js <auctionId>

# Optional signature validation (EU DSS, ~1.5 GB RAM)
dstg --profile dss up -d --build dss
```

Staging is marked `X-Robots-Tag: noindex`, uses test-certificate signatures
(`SIGNATURE_REQUIRE_QUALIFIED=false`) and allows demo data (`ALLOW_DEMO_DATA=true`). Never copy
these settings to production.
