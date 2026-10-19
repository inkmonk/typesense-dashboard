# Typesense gateway (PIA sign-in)

Lets the dashboard sign in through PIA and keeps both Typesense keys on the server.

```
Browser ──Authorization: Bearer <PIA JWT>──▶ nginx /v1/
                                              │ auth_request ─▶ auth-service (127.0.0.1:9177) ─▶ PIA token-verify
                                              │   200 + X-Role: admin | readonly   (cached ~60s)
                                              │   401 bad token · 403 not ops team · 500 PIA down
                                              ▼
                              sets X-TYPESENSE-API-KEY from the role, strips the PIA token
                                              ▼
                                     Typesense 127.0.0.1:8108
```

| PIA says                                 | Gets                         |
| ---------------------------------------- | ---------------------------- |
| `is_ops_team = false`                    | 403, never reaches Typesense |
| `is_ops_team = true`, `is_staff = true`  | admin key                    |
| `is_ops_team = true`, `is_staff = false` | read-only key                |

Requests with **no** `Authorization` header keep working with their own `x-typesense-api-key`
(the dashboard's "API key" tab, scripts). That is the `LEGACY` block in the nginx file; remove it
at the end, see step 7.

## Files

| File                                | Goes where                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `auth-service.js`                   | runs from this repo checkout on the server                                                 |
| `typesense-auth.service`            | `/etc/systemd/system/`                                                                     |
| `nginx/typesense.printo.in.conf`    | replaces `/etc/nginx/sites-enabled/typesense.printo.in`                                    |
| `nginx/typesense-keys.conf.example` | copy to `/etc/nginx/conf.d/typesense-keys.conf` and fill in; **never commit the real one** |

## Rollout (on the server, in order)

Keep a second SSH session open the whole time. Every nginx change is checked with `nginx -t` and
has a one-line way back.

**1. Get the code and check it runs.** The server checkout is `~/typesense-dashboard`; it must have
this branch's `gateway/` folder (see `deploy.sh`).

```bash
which node && node -v          # expect /usr/bin/node and v18.18 or newer
cd ~/typesense-dashboard && node --test gateway/auth-service.test.js
```

**2. Start the auth service.**

```bash
sudo cp ~/typesense-dashboard/gateway/typesense-auth.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now typesense-auth
curl -s localhost:9177/health; echo        # typesense-auth ok
curl -s -o /dev/null -w '%{http_code}\n' localhost:9177/auth        # 401 (no token)
```

If `which node` printed a different path, fix `ExecStart` in the unit first.

**3. Create the read-only Typesense key.** The admin key is read from the server's own config and
is not printed. Check the action names against the Typesense docs for your version; the dashboard
pages that need an action you left out will show errors.

```bash
ADMIN=$(sudo awk -F'[ =]+' '/^api-key/ {print $2}' /etc/typesense/typesense-server.ini)
curl -s -X POST http://127.0.0.1:8108/keys \
  -H "X-TYPESENSE-API-KEY: $ADMIN" -H 'Content-Type: application/json' \
  -d '{"description":"dashboard read-only","collections":["*"],"actions":[
    "collections:list","collections:get","documents:search","documents:get","documents:export",
    "aliases:list","aliases:get","synonyms:list","synonyms:get","overrides:list","overrides:get",
    "stopwords:list","stopwords:get","presets:list","presets:get","analytics/rules:list",
    "metrics.json:list","stats.json:list"]}'
```

The response shows the new key **once** in its `value` field. Copy it somewhere safe now.

**4. Put both keys in nginx.** Type the read-only key at the prompt (nothing is echoed):

```bash
read -rs RO; echo
sudo tee /etc/nginx/conf.d/typesense-keys.conf >/dev/null <<EOF
map \$ts_role \$ts_api_key { default ""; admin "$ADMIN"; readonly "$RO"; }
EOF
sudo chown root:root /etc/nginx/conf.d/typesense-keys.conf && sudo chmod 640 /etc/nginx/conf.d/typesense-keys.conf
unset ADMIN RO
```

**5. Switch the site config.** Back up first. (`typesense.printo.in.backup` in `sites-enabled` is
also loaded by nginx; move it out, as shown, so only one definition is live.)

```bash
sudo cp /etc/nginx/sites-enabled/typesense.printo.in ~/typesense.printo.in.before-gateway
sudo mv /etc/nginx/sites-enabled/typesense.printo.in.backup ~/
sudo cp ~/typesense-dashboard/gateway/nginx/typesense.printo.in.conf /etc/nginx/sites-enabled/typesense.printo.in
sudo nginx -t && sudo systemctl reload nginx
```

Way back, any time:

```bash
sudo cp ~/typesense.printo.in.before-gateway /etc/nginx/sites-enabled/typesense.printo.in && sudo nginx -t && sudo systemctl reload nginx
```

**6. Test.** Type a PIA login at the prompts (nothing is echoed or saved):

```bash
read -r -p 'employee id: ' U; read -rs -p 'password: ' P; echo
TOKEN=$(curl -s -X POST https://pia.printo.in/api/v1/auth/ -H 'Content-Type: application/json' \
  -d "{\"email\":\"$U\",\"password\":\"$P\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access",""))'); unset P
B=https://typesense.printo.in/v1
curl -s -o /dev/null -w 'no token, no key (expect 401 from Typesense): %{http_code}\n' $B/collections
curl -s -o /dev/null -w 'bad token (expect 401): %{http_code}\n' -H 'Authorization: Bearer nope' $B/collections
curl -s -o /dev/null -w 'your token, read (expect 200): %{http_code}\n' -H "Authorization: Bearer $TOKEN" $B/collections
curl -s -o /dev/null -w 'your token, metrics (200 if staff): %{http_code}\n' -H "Authorization: Bearer $TOKEN" $B/metrics.json
```

For a non-staff ops user the write test should be refused by Typesense with 401/403. Then sign in
on the dashboard through the PIA tab and look at collections, search and the server status page.

**7. Close the legacy path** once everyone uses PIA: delete the `if ($http_authorization = "")`
block and the `location /_ts_legacy/` block, `nginx -t`, reload, then rebuild the dashboard with
`ENABLE_API_KEY_LOGIN=false`. Rotate the admin key afterwards if it was ever shared in clear text.

## Checks worth doing once

- **Port 8108 must not be reachable from outside.** `ss -ltn | grep 8108` should show `127.0.0.1:8108`,
  and the security group should not open 8108. Otherwise the gateway can be bypassed.
- **PIA tokens last 45 days** and the service caches a verdict for 60s (`CACHE_MS`). A user switched
  off in PIA loses access within about a minute.
- If PIA is down, `/v1` returns 500 for PIA-token requests (fails closed). The legacy path is unaffected.
- `auth-service.js` has no dependencies and listens on loopback only.
