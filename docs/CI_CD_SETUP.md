# CI/CD setup (one-time, on the server)

The workflow is in `.github/workflows/ci-cd.yml`. This document is only for
the one-time setup on the `/opt/netdesk` server - GitHub can't do any of
this for you by itself, the runner has to be physically installed there.

Before the first automatic deploy runs: **fully shut down the existing
polling service/cron** (already reported as deactivated - double-check
there's really no more `git pull`/restart running in the background, so the
two mechanisms don't overlap).

## 1. Install the self-hosted runner

GitHub → repo → **Settings → Actions → Runners → New self-hosted runner**,
follow the instructions there (it picks the OS/architecture for you). In
short, on the server:

```bash
sudo mkdir -p /opt/actions-runner && cd /opt/actions-runner
# get the link/token from the GitHub page from the step above (expires quickly)
curl -o actions-runner-linux-x64.tar.gz -L <URL from the GitHub page>
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/milosursulovic/net-desk --token <TOKEN>
```

When asked for labels, the default (`self-hosted`) is enough - the workflow
targets `runs-on: self-hosted` with no extra labels.

Install it as a service (to survive a reboot, run without an open
terminal):

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

## 2. Let the runner restart netdesk.service WITHOUT a password

The runner service runs by default under the account that installed it
(check with `sudo ./svc.sh status` which user that is). The deploy job
calls `sudo systemctl restart netdesk.service` - without the following,
that step will hang waiting for a password CI can never type.

```bash
sudo visudo -f /etc/sudoers.d/netdesk-deploy
```

Contents (replace `RUNNER_USER` with the actual account from the step
above):

```
RUNNER_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart netdesk.service, /usr/bin/systemctl is-active --quiet netdesk.service
```

## 3. Check the runner has what it needs

The same account must be able to run `npm ci`/`npm run build`/`npm run
migrate` just like now (node/npm on PATH, network access to the npm
registry, MySQL/MariaDB reachable for migrations) - essentially the same
environment the previous polling script used, just now run by the runner
instead of cron.

`rsync` must be installed (`rsync --version`) - usually already there, but
check.

**Network SSL inspection (known issue)**: this organization's network has
an SSL-inspecting firewall/proxy that injects its own self-signed root CA
into all HTTPS traffic. `curl` doesn't notice (it uses the system trust
store, which already has that CA), but Node/npm uses its own bundled CA
bundle and doesn't trust it - `npm ci` hangs in an endless retry with
`SELF_SIGNED_CERT_IN_CHAIN` instead of failing fast. Fix - add to the
runner's `.env` (`/opt/actions-runner/.env`, read by the runner service and
injected into every job):

```
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
```

then restart the service (`sudo ./svc.sh stop && sudo ./svc.sh start`). If
the runner ever needs to be reinstalled on the same or a different server
on the same network, repeat this step right away - without it the first
deploy will look like it's hung (when it's actually just retrying the TLS
handshake forever).

## 4. First deploy

Nothing special - the first push to `main` after this setup will
automatically run CI then deploy. `/opt/netdesk/app` already has `.env`
files and `backend/uploads/` with real data - the `.gitignore` filter in
the workflow leaves them untouched (see the comment in `ci-cd.yml`), only
code tracked in git gets synced.

Watch it live: GitHub repo → **Actions** tab.

## Note about tests

`backend/tests/integration/*` (hits the real database) is deliberately NOT
part of CI - the repo has no baseline SQL schema (only incremental
migrations from 0001 onward), so an empty database can't reliably be
brought up for an ephemeral CI runner. That test suite remains what it's
always been: run manually with `npm test` on the dev machine before
pushing (CLAUDE.md "Workflow expectations"). CI covers what it can safely
cover without a database: frontend build/lint/test and the backend's
DB-free unit tests (`tests/unit`).
