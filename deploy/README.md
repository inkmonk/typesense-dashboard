# Deploying the dashboard

The dashboard is static files that nginx serves at `https://typesense.printo.in/dashboard/`.
`deploy.sh` (repo root) builds the site and swaps it in. `deploy/nginx/typesense.printo.in.conf`
is the nginx site file for these paths. It also forwards `/pia/` to PIA, which is how the
sign-in page reaches PIA without a cross-origin call.

## Every deploy

On the server:

```bash
cd ~/typesense-dashboard && git pull --ff-only origin main && ./deploy.sh
```

It ends with `Deploy verified.` in green. If the site misbehaves: `./deploy.sh rollback`.

### Changing what a deploy builds

Copy `deploy.env.example` to `deploy.env` on the server and remove the leading `#` from the
lines you want, for example `ENABLE_API_KEY_LOGIN=true` to bring the API key tab back. `deploy.env`
is ignored by git, so editing it never blocks a deploy. Put the `#` back to undo.

## One-time: switch nginx to the /dashboard/ paths

Do this once, after pulling, and **before** the first deploy of a build that uses `/dashboard/`.

```bash
sudo cp /etc/nginx/sites-enabled/typesense.printo.in ~/typesense.printo.in.before-dashboard-paths
sudo cp ~/typesense-dashboard/deploy/nginx/typesense.printo.in.conf /etc/nginx/sites-enabled/typesense.printo.in
sudo nginx -t && sudo systemctl reload nginx
```

If `nginx -t` prints anything other than "test is successful", nothing has been reloaded; put the
backup back and stop:

```bash
sudo cp ~/typesense.printo.in.before-dashboard-paths /etc/nginx/sites-enabled/typesense.printo.in && sudo nginx -t && sudo systemctl reload nginx
```

`sites-enabled/typesense.printo.in.backup` is also loaded by nginx. Move it out of that folder
(`sudo mv /etc/nginx/sites-enabled/typesense.printo.in.backup ~/`) so only one definition is live.
