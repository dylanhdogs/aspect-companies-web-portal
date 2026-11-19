# Hostinger VPS deployment

This deployment bundle targets a Linux VPS running systemd, Nginx, and Node.js 22.13 or newer. It runs the portal as a dedicated unprivileged user, keeps SQLite and private documents in `/var/lib/aspect-portal`, and exposes the app only through Nginx on the VPS.

## Hostinger Docker Manager deployment

Use this path when the VPS is managed through Docker Manager. It adds a separate `aspect-portal` Compose project with its own persistent Docker volume; it does not replace or edit existing projects such as `n8n` or `webapp`. The app is reachable through Traefik over HTTPS and does not publish its application port directly to the internet. You do not need to buy a domain: Hostinger can provide a temporary hostname for a Docker app and Traefik can secure it with HTTPS. Hostinger describes this automatic hostname and SSL flow in its [Docker app SSL guide](https://www.hostinger.com/support/how-to-add-ssl-to-openclaw-on-hostinger/).

For the VPS shown in this project, `aspect-portal.srv1633240.hstgr.cloud` is the default dedicated hostname and resolves to the VPS. The Compose file uses it when `ASPECT_PORTAL_DOMAIN` is omitted, so Hostinger Docker Manager can deploy without a separate project `.env` just to satisfy Compose interpolation. If you use a different dedicated hostname, set `ASPECT_PORTAL_DOMAIN` in the Docker Manager project environment. The secure route will be active only after Traefik is running and the certificate has been issued.

Before deploying, choose a dedicated hostname that resolves to this VPS. It can be a custom domain or a Hostinger-assigned hostname if that hostname supports the required DNS routing. A direct IP address is not a valid Traefik `Host()` rule. Do not reuse the hostname already assigned to another application.

The current `n8n` project on this VPS already includes a Traefik container bound to ports 80 and 443. Do **not** deploy another Traefik instance. The portal joins the existing `n8n_default` Docker network and uses the `mytlschallenge` certificate resolver already configured there. This preserves the existing proxy and lets each app use a separate hostname. Hostinger documents this shared routing model in its [Docker Manager Traefik guide](https://www.hostinger.com/support/connecting-multiple-docker-compose-projects-using-traefik-in-hostinger-docker-manager/).

1. Build a release ZIP on the computer that has this project:

   ```powershell
   node scripts/package-release.js
   ```

   Upload the ZIP to the VPS over SFTP and extract it into a new versioned folder such as `/opt/aspect-portal/releases/20261017-0252`. Keep the private `.env` at `/opt/aspect-portal/.env`; the release excludes databases, documents, backups, and local settings. The `.dockerignore` also keeps those files out of the Docker build context.

   Build and switch to that release while reusing the existing data volume and Traefik network:

   ```bash
   ASPECT_PORTAL_RELEASE_ID=20261017-0252 docker compose -p aspect-portal \
     --project-directory /opt/aspect-portal/releases/20261017-0252 \
     --env-file /opt/aspect-portal/.env \
     -f /opt/aspect-portal/releases/20261017-0252/deploy/hostinger/docker-compose.yml \
     up --build -d
   ```

   Keep earlier release folders and image tags until the new health check and inquiry flow pass. Roll back by running the prior release Compose file with its matching `ASPECT_PORTAL_RELEASE_ID`.

2. Create a private Compose environment file on the VPS. Replace the example hostname with the dedicated HTTPS hostname you configured in DNS. The setup token is generated on the VPS and is not printed by this command:

   ```bash
   cd /opt/aspect-portal
   sudo sh -c 'umask 077; printf "ASPECT_SETUP_TOKEN=%s\\nSIGNATURE_DESIGN_INTEGRATION_ENABLED=false\\nSIGNATURE_DESIGN_HMAC_KEY_ID=\\nSIGNATURE_DESIGN_HMAC_SECRET=\\n" "$(openssl rand -hex 32)" > /opt/aspect-portal/.env'
   sudo chown root:root /opt/aspect-portal/.env
   sudo chmod 0600 /opt/aspect-portal/.env
   ```

   The Signature Design receiver variables are passed into the container by Compose. Keep `SIGNATURE_DESIGN_INTEGRATION_ENABLED=false` until the sender and receiver have passed staging acceptance. Before enabling production delivery, set a shared key ID and random HMAC secret of at least 32 bytes in the target `.env` and the Design sender's protected production environment file. Imported inquiries enter the shared, unassigned Signature Exteriors Reception queue; each active platform administrator and active Signature Exteriors member receives a notification. Keep both files private (`0600`); do not put key values in release files, browser forms, or chat. Deploy the receiver with its flag off, verify the staged end-to-end flow, then enable the receiver and sender flags in a controlled cutover.

   To send external calendar invitations, add your SMTP account to that private file before starting the service. Keep SMTP secrets on the VPS; do not commit or send them in chat. Use the portal's public HTTPS address:

   ```bash
   sudo tee -a /opt/aspect-portal/.env >/dev/null <<'EOF'
   SMTP_HOST=
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=
   SMTP_PASS=
   SMTP_FROM=
   PORTAL_PUBLIC_URL=https://aspect-portal.srv1633240.hstgr.cloud
   EOF
   sudo chmod 0600 /opt/aspect-portal/.env
   ```

   Use `SMTP_SECURE=true` with port 465. With port 587, leave it false so SMTP can use STARTTLS. Set `SMTP_FROM` to the default sender name and address approved by your mail provider. Platform administrators can change the calendar invitation sender address in **Portal settings → Admin**; the chosen address must also be approved by the mail provider. This UI setting does not replace SMTP credentials or server configuration. If mail is not configured, calendar events still save and their invitation status will report that email was not sent.

   Upcoming timed-event reminders are managed in **Portal settings → Optional workflows** and **Portal settings → Admin**. Portal-created events email only the event owner at the address on their user profile; they do not send reminder email to other internal attendees. Events imported by a future external calendar connection may notify the linked users on that imported event. Profile reminders use the same protected SMTP connection as calendar invitations. To add Slack reminders, create an Incoming Webhook in Slack for the intended channel, paste it into the Admin settings screen, and use **Send test**. The webhook is stored with the portal's private database data and is never returned to the browser after it is saved. Treat portal backups as secrets because they include this connection credential.

3. Confirm the existing n8n network exists before starting the app:

   ```bash
   sudo docker network inspect n8n_default
   ```

   If it is missing, stop here and inspect the current n8n Compose project before changing proxy settings. Do not expose the portal with plain HTTP for staff sign-in.

4. Start the portal as its own Compose project:

   ```bash
   sudo docker compose --project-directory /opt/aspect-portal -f /opt/aspect-portal/deploy/hostinger/docker-compose.yml up --build -d
   sudo docker compose --project-directory /opt/aspect-portal -f /opt/aspect-portal/deploy/hostinger/docker-compose.yml ps
   ```

   Traefik obtains HTTPS for the dedicated Hostinger hostname and forwards traffic to the portal on the private Docker network. The portal's database, files, and snapshots persist in the `aspect-portal-data` volume when the container is updated or recreated.

Live updates for project Discussions, Tasks, shared Requests, Calendar, and their notifications are on by default. If the live connection needs to be paused, add `PORTAL_LIVE_UPDATES=false` to `/opt/aspect-portal/.env` and recreate the portal container. The existing timed refresh for notifications will continue to work while live updates are paused.

5. Open `https://<your-dedicated-hostname>/` and create the first administrator using the one-time setup token from the private `.env` file. Keep the token private. After successful setup, remove it from the environment and recreate the container so the running service no longer receives it:

   ```bash
   sudo sed -i '/^ASPECT_SETUP_TOKEN=/d' /opt/aspect-portal/.env
   sudo docker compose --project-directory /opt/aspect-portal -f /opt/aspect-portal/deploy/hostinger/docker-compose.yml up -d --force-recreate
   ```

6. If you are migrating the existing local workspace, transfer the whole backup snapshot folder to the VPS over SFTP. Copy it into `/data/backups/<snapshot-id>` inside the running portal container, then use **Backups** in the portal to refresh and restore it. Do this before staff create live records; restoring replaces the VPS workspace and signs users out. The snapshot contains password hashes and company data, so keep it private and transfer it only over SFTP/SSH.

   ```bash
   cd /opt/aspect-portal
   snapshot_id='REPLACE_WITH_THE_SNAPSHOT_ID'
   sudo docker compose --project-directory /opt/aspect-portal -f /opt/aspect-portal/deploy/hostinger/docker-compose.yml run --rm --no-deps --volume "/tmp/$snapshot_id:/snapshot:ro" --entrypoint sh aspect-portal -c "mkdir -p '/data/backups/$snapshot_id' && cp -R /snapshot/. '/data/backups/$snapshot_id/' && chmod -R go-rwx '/data/backups/$snapshot_id'"
   ```

   Replace the snapshot ID with the real folder name. Keep an encrypted copy outside the VPS and verify the migrated accounts, company access, records, and documents before inviting staff.

7. Keep regular off-VPS backups. The portal snapshots are stored in its persistent Docker volume, so they do not protect against loss of the VPS or its volume. Configure Hostinger's VPS backup feature or copy encrypted snapshots to separate storage and periodically verify a restore.

For updates, upload a new code-only ZIP, extract it to a staging folder, then replace `/opt/aspect-portal` while preserving the Compose `.env` and Docker volume. Rebuild with `docker compose ... up --build -d`; never remove `aspect-portal-data` during a code update.

## systemd/Nginx deployment

The systemd/Nginx instructions below are an alternative for a VPS that is not managed through Hostinger Docker Manager. Do not combine the systemd service with the Docker Compose app on the same port.

## Before you publish

- A domain is recommended for a memorable staff link, but it is not required. This bundle supports a direct public IPv4 link using a short-lived Let's Encrypt IP certificate; use the IP-specific steps below and keep automatic renewal working. Do not collect staff passwords over plain HTTP.
- If you use a domain/subdomain such as `portal.yourdomain.com`, add an `A` record pointing to the public IPv4 address shown in Hostinger hPanel. Configure IPv6 DNS/listeners only if IPv6 is enabled on the VPS.
- Confirm the VPS operating system. These commands are for Ubuntu/Debian with systemd and Nginx; other Hostinger images may use a different service or firewall setup.
- Install Node.js 22.13 or newer and Nginx. Check `node --version`, `command -v node`, and `nginx -v` over SSH. The systemd unit needs an absolute Node path that the service can execute; replace `__NODE_PATH__` with the output of `command -v node`.
- Allow inbound TCP ports 80 and 443 in both the Hostinger firewall and the VPS firewall. Keep port 3000 private; the application binds to `127.0.0.1`.

Do not send VPS passwords, SSH private keys, or access tokens in chat. Use the provider console or SSH from your computer.

## Build a code-only release

With Node.js installed, run this from the project directory:

```powershell
node scripts/package-release.js
```

The ZIP is created in your user Downloads folder. The script refuses to overwrite an existing ZIP; pass a new output path as its first argument if needed. It contains the server, frontend, recovery utility, and deployment files, while omitting `data/`, SQLite files, documents, backups, and local settings. Upload the ZIP to the VPS over SSH/SFTP.

## Install the application

On an Ubuntu/Debian VPS, create a service account and persistent data directory:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin aspectportal
sudo install -d -o root -g root -m 0755 /opt/aspect-portal
sudo install -d -o aspectportal -g aspectportal -m 0700 /var/lib/aspect-portal
```

Upload the ZIP to `/tmp/aspect-portal-release.zip`, then extract it into `/opt/aspect-portal` so that `server.js` is at that path:

```bash
sudo apt-get update
sudo apt-get install -y unzip
sudo unzip -q /tmp/aspect-portal-release.zip -d /opt/aspect-portal
cd /opt/aspect-portal && sudo npm ci --omit=dev
```

Keep application code owned by root and readable by the service account, for example:

```bash
sudo chown -R root:root /opt/aspect-portal
sudo find /opt/aspect-portal -type d -exec chmod 0755 {} \;
sudo find /opt/aspect-portal -type f -exec chmod 0644 {} \;
```

Before starting the production service, create the one-time code that authorizes the first administrator account. The code is generated on the VPS, stored in a root-only environment file, and is required only while the workspace has no users. Keep the terminal private and do not send the code in chat.

```bash
sudo sh -c 'umask 077; printf "ASPECT_SETUP_TOKEN=%s\n" "$(openssl rand -hex 32)" > /etc/aspect-portal.env'
sudo cat /etc/aspect-portal.env
```

For external calendar email, add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `PORTAL_PUBLIC_URL` to `/etc/aspect-portal.env`. Keep that file root-owned with mode `0600`, then restart `aspect-portal`. Use port 465 with `SMTP_SECURE=true`, or port 587 with `SMTP_SECURE=false`. Platform administrators can set a calendar sender override in **Portal settings → Admin** after signing in. The address must be authorized by the mail provider; SMTP credentials remain in the environment file.

The systemd unit loads this file. If the code is missing or shorter than 32 bytes, first-admin setup stays locked. Keep the terminal private; enter this code on the initial setup form after the HTTPS site is ready. Remove the environment file immediately after creating the first administrator.

Install the systemd unit before enabling the service. Replace `__NODE_PATH__` with the absolute Node executable path from `command -v node`:

```bash
sudo cp /opt/aspect-portal/deploy/hostinger/aspect-portal.service /etc/systemd/system/aspect-portal.service
ASPECT_NODE_EXECUTABLE="$(command -v node)"
sudo sed -i "s|__NODE_PATH__|${ASPECT_NODE_EXECUTABLE}|g" /etc/systemd/system/aspect-portal.service
sudo systemctl daemon-reload
sudo systemctl enable --now aspect-portal
sudo systemctl status aspect-portal
curl -fsS http://127.0.0.1:3000/api/health
```

The health response should report `"status":"ok"`. Configure Nginx and HTTPS below before opening the public portal. Review service output with `sudo journalctl -u aspect-portal -n 100 --no-pager` if startup fails.

## Configure Nginx and HTTPS with the VPS IPv4 address

Let’s Encrypt IP certificates are valid for about six days. Certbot 5.4 or newer can obtain and renew them, but its Nginx installer does not install IP certificates into Nginx. The IP configuration below loads the Certbot files directly and the saved deploy hook reloads Nginx after each successful renewal. Keep the Certbot renewal timer enabled and check it regularly. See the [Let’s Encrypt IP certificate instructions](https://letsencrypt.org/2026/03/11/shorter-certs-certbot) for current Certbot support details.

For Ubuntu/Debian, install a current Certbot release using the official [Certbot installation instructions](https://certbot.eff.org/instructions). If using the Snap package, the install commands are:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
certbot --version
```

If Certbot is already installed from the OS package manager, remove that package before using the Snap version so the `certbot` command resolves to the current client.

Create the ACME webroot and first install the HTTP-only challenge configuration. Replace `203.0.113.10` with the VPS public IPv4 address from Hostinger hPanel:

```bash
sudo install -d -m 0755 /var/www/certbot/.well-known/acme-challenge
sudo cp /opt/aspect-portal/deploy/hostinger/nginx-aspect-portal-ip-bootstrap.conf /etc/nginx/sites-available/aspect-portal
sudo sed -i 's/__VPS_PUBLIC_IPV4__/203.0.113.10/g' /etc/nginx/sites-available/aspect-portal
sudo ln -s /etc/nginx/sites-available/aspect-portal /etc/nginx/sites-enabled/aspect-portal
sudo nginx -t
sudo systemctl reload nginx
certbot --version
```

Use Certbot 5.4 or newer. Obtain the short-lived certificate using the HTTP webroot challenge, then install the HTTPS Nginx configuration. Replace the example IP with the same public IPv4 address:

```bash
sudo certbot certonly --webroot --webroot-path /var/www/certbot --ip-address 203.0.113.10 --preferred-profile shortlived --deploy-hook "/usr/bin/systemctl reload nginx"
sudo cp /opt/aspect-portal/deploy/hostinger/nginx-aspect-portal-ip.conf /etc/nginx/sites-available/aspect-portal
sudo sed -i 's/__VPS_PUBLIC_IPV4__/203.0.113.10/g' /etc/nginx/sites-available/aspect-portal
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl list-timers | grep -i certbot
sudo certbot renew --dry-run
```

After confirming the certificate and automatic renewal, staff can open `https://203.0.113.10/` using the actual VPS IP. Keep ports 80 and 443 open so HTTP validation and HTTPS work. If you later add a domain, use the domain configuration below instead.

## Configure Nginx and HTTPS with a domain

Copy `deploy/hostinger/nginx-aspect-portal.conf` to `/etc/nginx/sites-available/aspect-portal`. Replace `__PORTAL_DOMAIN__` with the exact DNS name. Enable the site, validate the configuration, and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/aspect-portal /etc/nginx/sites-enabled/aspect-portal
sudo nginx -t
sudo systemctl reload nginx
```

After the domain resolves to this VPS and port 80 is reachable, install Certbot and its Nginx plugin for the VPS distribution, then request a certificate for the portal domain. Certbot can configure the HTTPS listener and renewal. Confirm renewal with `sudo certbot renew --dry-run`.

The Nginx templates overwrite `X-Forwarded-For` with the actual client address. That matches `ASPECT_TRUST_PROXY=1` in the service unit and prevents clients from choosing the IP used by login rate limiting. Keep Nginx and the service on the same VPS unless the trusted-proxy configuration is deliberately redesigned.

## First sign-in and recovery

Open the HTTPS IP address or domain after the certificate is active. The initial setup form asks for the one-time code created on the VPS, your administrator details, and a unique password of at least 12 characters. After creating the first administrator, remove the setup code and restart the service:

```bash
sudo rm /etc/aspect-portal.env
sudo systemctl restart aspect-portal
```

Then use **Manage access** to create manager/member accounts and scope each account to the companies it should access. Share one-time passwords through a secure channel outside the portal.

Employees can ask an administrator to reset their password from **Manage access**. If every administrator account is locked out, run the included recovery utility over SSH from the application directory, setting the same persistent data directory used by systemd:

```bash
cd /opt/aspect-portal
ASPECT_DATA_DIR=/var/lib/aspect-portal node scripts/recover-admin.js
```

The recovery utility prints a one-time password in the terminal, revokes existing sessions for that administrator, and requires a password change at next sign-in. Keep the terminal private and do not put the one-time password into tickets or chat.

## Move an existing local workspace to Hostinger

If the local portal already has companies, users, projects, tasks, notes, or documents that should continue on Hostinger, migrate a portal snapshot after the VPS is deployed and its initial administrator has signed in. The snapshot contains company data and password hashes; transfer it only over SFTP/SSH and keep it private.

1. In the local portal, sign in as an administrator, open **Backups**, and choose **Create backup**. Wait for the success message. The portal creates a consistent SQLite snapshot and copies its related documents, even while the live database is using SQLite's write-ahead log.
2. On the computer hosting the local portal, locate `data/backups/<snapshot-id>/`. Transfer that entire snapshot folder to a temporary directory on the VPS. It must contain `manifest.json`, `portal.sqlite`, and the `documents` folder. Do not copy the live `data/portal.sqlite` file or its `-wal`/`-shm` sidecars.
3. Install the snapshot in the portal backup directory. Replace the example snapshot ID and staging path with the folder you transferred:

   ```bash
   snapshot_id='REPLACE_WITH_THE_SNAPSHOT_ID'
   sudo install -d -o aspectportal -g aspectportal -m 0700 /var/lib/aspect-portal/backups
   sudo cp -a "/tmp/aspect-snapshot/${snapshot_id}" /var/lib/aspect-portal/backups/
   sudo chown -R aspectportal:aspectportal "/var/lib/aspect-portal/backups/${snapshot_id}"
   sudo find "/var/lib/aspect-portal/backups/${snapshot_id}" -type d -exec chmod 0700 {} \;
   sudo find "/var/lib/aspect-portal/backups/${snapshot_id}" -type f -exec chmod 0600 {} \;
   ```

4. In the HTTPS portal, open **Backups**, select **Refresh**, and restore the imported snapshot. Restore automatically takes a safety snapshot of the initial VPS workspace, then signs users out and replaces its data with the local snapshot.
5. Sign in with an active administrator account and password from the local workspace. The temporary VPS setup account is replaced by the restored accounts. Revoke or reset any accounts that should not have access to the live portal.

The snapshot excludes active login sessions. Keep an encrypted copy outside the VPS until you have signed in and confirmed the migrated companies, access, records, and documents.

## Protect production data

The portal's **Backups & restore** feature stores consistent SQLite-plus-document snapshots under `/var/lib/aspect-portal/backups`. The VPS service account must retain write access to that directory. A restore signs users out and replaces the active workspace, after saving a pre-restore snapshot.

Keep an encrypted copy outside the VPS as well. Hostinger VPS snapshots/backups are a separate provider feature; check the current plan, schedule, retention, and restore process in hPanel instead of assuming that a portal snapshot is off-site. Periodically confirm that a snapshot can be restored before loading irreplaceable records.

## Updating the portal

Create a fresh code-only ZIP for each release. Back up the portal first, upload/extract the code into a staging folder, then replace `/opt/aspect-portal` while preserving `/var/lib/aspect-portal`. Restart with `sudo systemctl restart aspect-portal` and check the service journal and `/api/health`. Never extract a release over `/var/lib/aspect-portal` or delete that directory during an update.
