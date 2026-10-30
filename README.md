# Canteen Pre-order System (Node.js + React + Podman)

A small web app that records food pre-orders for a college canteen. Students pick items from the menu, the app calculates the total, and they pay at the counter. **There is no online payment** (out of scope).

The app runs as **two containers** built from **two custom images** on a **Podman network**:

- `canteen-web`: nginx serves the React front end and forwards `/api/...` to the backend
- `canteen-api`: Node.js + Express REST API, which stores data in a **Podman volume**

## Features

| Requirement | How it is met |
|---|---|
| Display a small menu with prices | Menu table (8 seeded items), `GET /api/menu` |
| Create an order with one or more items | Enter quantities, enter a name, click **Place order** (`POST /api/orders`) |
| Calculate the order total | Live total in React while choosing. The saved total is recalculated on the **server** from menu prices, so the browser cannot change prices |
| List orders and update order status | Orders table with a status dropdown (`PATCH /api/orders/:id/status`) |
| **Variation: daily order count** | "Daily order count" card: orders on a chosen day, counts per status, amount to collect, 7-day bar chart (`GET /api/stats?date=`) |
| **Variation: filter orders by status** | Status and date filters on the orders table (`GET /api/orders?status=READY&date=2026-10-30`) |
| Menu/order data must persist | `db.json` lives in `/data`, which is the Podman volume `canteen-data` |
| Extra | Kitchen staff can add menu items. Collected and cancelled orders are locked |

Order status flow: `PLACED → PREPARING → READY → COLLECTED` (or `CANCELLED`). After an order is `COLLECTED` or `CANCELLED` it cannot change.

## Tech stack

| Part | Technology |
|---|---|
| Front end | React 19 (JavaScript/JSX), HTML, CSS, built with Vite |
| Back end | Node.js 22, Express 5 |
| Storage | JSON file (`db.json`). Writes go to a temp file first and are then renamed, so a crash cannot leave a half-written file |
| Web server / reverse proxy | nginx 1.28 |
| Containers | Podman 5.x: 2 Containerfiles (one multi-stage), bridge network, named volume, bind mount, port mapping, health checks |
| Tests | `node:test` unit tests + `scripts/smoke-test.sh` end-to-end tests |

## Architecture

```
 Host (Windows)                       Podman network: canteen-net (bridge with DNS)
 ┌───────────┐  http://localhost:8085  ┌──────────────────────┐  http://canteen-api:3000  ┌──────────────────────┐
 │  Browser  │ ──────────────────────▶ │ canteen-web (nginx)  │ ────────────────────────▶ │ canteen-api (Node)   │
 └───────────┘      -p 8085:80         │ React static files   │   /api/* proxied by name  │ Express REST API     │
                                       │ image canteen-web:1.0│                           │ image canteen-api:1.0│
                                       └──────────────────────┘                           │ /data ◀── volume     │
                                                                                          │       canteen-data   │
                                                                                          └──────────────────────┘
```

- Only the web container publishes a port. The API is **not** reachable from the host directly; it is only reachable inside `canteen-net`.
- nginx finds the API by its **container name**, using Podman's built-in DNS (aardvark-dns).

## Project structure

```
canteen-preorder-podman/
├── backend/
│   ├── Containerfile              # node:22-alpine, production deps only, runs as non-root "node"
│   ├── .containerignore
│   ├── package.json
│   ├── src/server.js              # Express routes, logging, error handling, graceful shutdown
│   ├── src/store.js               # menu/orders logic + saving to /data/db.json
│   └── test/store.test.js         # unit tests (npm test)
├── frontend/
│   ├── Containerfile              # multi-stage: Node builds React, nginx serves it
│   ├── .containerignore
│   ├── nginx/default.conf.template  # static files + /api reverse proxy
│   ├── package.json, vite.config.js, index.html
│   └── src/
│       ├── main.jsx, App.jsx, App.css, api.js
│       └── components/  OrderForm.jsx, AddMenuItem.jsx, DailyStats.jsx, OrderList.jsx, Message.jsx
├── scripts/
│   ├── start.ps1                  # build + create network/volume + run both containers
│   ├── stop.ps1                   # stop and remove containers (data kept)
│   └── smoke-test.sh              # end-to-end API tests
└── README.md
```

## Configuration (environment variables)

| Container | Variable | Default | Meaning |
|---|---|---|---|
| canteen-api | `PORT` | `3000` | Port the API listens on |
| canteen-api | `DATA_DIR` | `/data` | Folder that holds `db.json` |
| canteen-api | `APP_TZ` | `Asia/Kolkata` | Time zone that decides what "today" means for the daily count |
| canteen-web | `API_HOST` | `canteen-api` | Name of the API container on the network |
| canteen-web | `API_PORT` | `3000` | API port |

---

## Commands used

All commands were run in **PowerShell** on Windows 11 with Podman 5.8 (they also work in a Linux shell).

> **Quick start:** `.\scripts\start.ps1` runs steps 1–3 for you. The steps below show each command one at a time, for the demo.

### 0. Start Podman (Windows/macOS only)

```powershell
podman machine start
podman info
```

### 1. Build the two custom images

```powershell
cd canteen-preorder-podman
podman build --format docker -t canteen-api:1.0 ./backend
podman build --format docker -t canteen-web:1.0 ./frontend
podman images
podman history canteen-web:1.0
podman image inspect canteen-api:1.0
```

Podman finds the `Containerfile` in each folder on its own. `--format docker` keeps the `HEALTHCHECK` instruction; the default OCI format drops it.

### 2. Create the network and the volume

```powershell
podman network create canteen-net
podman network ls
podman network inspect canteen-net

podman volume create canteen-data
podman volume ls
podman volume inspect canteen-data
```

### 3. Run the containers

```powershell
# Backend: on the network, with the volume, no published port
podman run -d --name canteen-api --network canteen-net `
  -v canteen-data:/data --restart unless-stopped canteen-api:1.0

# Frontend: on the same network, host port 8085 -> container port 80
podman run -d --name canteen-web --network canteen-net `
  -p 8085:80 --restart unless-stopped canteen-web:1.0
```

Open **http://localhost:8085** in a browser.

> We used host port **8085** because port 8080 on this laptop is already taken by the PostgreSQL/EDB web server (see Troubleshooting). Use any free port, for example `-p 8080:80`.

### 4. Container management

```powershell
podman ps                               # running containers
podman ps -a                            # all containers, including stopped ones
podman logs canteen-api                 # API log: every request and new order is printed
podman logs -f canteen-api              # follow the log live (Ctrl+C to stop)
podman logs canteen-web                 # nginx access log
podman stats --no-stream
podman top canteen-api
podman inspect canteen-api
podman port canteen-web
podman healthcheck run canteen-api
podman exec -it canteen-api sh          # shell inside the container
podman exec canteen-api cat /data/db.json
podman exec canteen-web cat /etc/nginx/conf.d/default.conf   # generated nginx config
podman stop canteen-api
podman start canteen-api
podman restart canteen-web
```

### 5. Use the API from the command line

```powershell
# read
curl.exe http://localhost:8085/api/health
curl.exe http://localhost:8085/api/menu
curl.exe http://localhost:8085/api/orders
curl.exe "http://localhost:8085/api/orders?status=PLACED"
curl.exe http://localhost:8085/api/stats
curl.exe "http://localhost:8085/api/stats?date=2026-10-30"

# write (Invoke-RestMethod works the same in Windows PowerShell 5.1 and PowerShell 7)
# 2 x Masala Dosa (Rs 50) + 1 x Tea (Rs 12) = Rs 112
Invoke-RestMethod -Method Post -Uri http://localhost:8085/api/orders -ContentType 'application/json' `
  -Body '{"customer":"Ravi","items":[{"menuItemId":1,"qty":2},{"menuItemId":6,"qty":1}]}'
Invoke-RestMethod -Method Patch -Uri http://localhost:8085/api/orders/1/status -ContentType 'application/json' `
  -Body '{"status":"READY"}'
Invoke-RestMethod -Method Post -Uri http://localhost:8085/api/menu -ContentType 'application/json' `
  -Body '{"name":"Paneer Roll","price":60}'
```

In Git Bash/Linux use curl: `curl -X PATCH -H "Content-Type: application/json" -d '{"status":"READY"}' http://localhost:8085/api/orders/1/status`

| Method | Path | Body / query | Purpose |
|---|---|---|---|
| GET | `/api/health` | | Health check |
| GET | `/api/menu` | | List the menu |
| POST | `/api/menu` | `{"name":"Paneer Roll","price":60}` | Add a menu item |
| GET | `/api/orders` | `?status=READY&date=2026-10-30` (both optional) | List or filter orders |
| POST | `/api/orders` | `{"customer":"Ravi","items":[{"menuItemId":1,"qty":2}]}` | Create an order |
| GET | `/api/orders/:id` | | One order |
| PATCH | `/api/orders/:id/status` | `{"status":"READY"}` | Update status |
| GET | `/api/stats` | `?date=2026-10-30` (default today) | Daily order count |

### 6. Test networking

```powershell
# A container on canteen-net reaches the API by name (DNS):
podman run --rm --network canteen-net docker.io/library/alpine wget -qO- http://canteen-api:3000/api/health

# A container NOT on canteen-net cannot resolve the name (prints "bad address"):
podman run --rm docker.io/library/alpine wget -qO- -T 3 http://canteen-api:3000/api/health

# The API port is not published, so the host cannot reach it directly (this fails):
curl.exe -m 3 http://localhost:3000/api/health

# Stop the API: nginx keeps serving the page, but /api now fails with an error
# (504 Gateway Timeout, because the name canteen-api no longer resolves)
podman stop canteen-api
curl.exe -i http://localhost:8085/api/health
podman start canteen-api
```

### 7. Prove that data persists

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8085/api/orders -ContentType 'application/json' `
  -Body '{"customer":"Persist Test","items":[{"menuItemId":3,"qty":1}]}'
podman rm -f canteen-api                         # delete the API container
podman run -d --name canteen-api --network canteen-net -v canteen-data:/data --restart unless-stopped canteen-api:1.0
curl.exe http://localhost:8085/api/orders        # "Persist Test" is still there
podman logs canteen-api                          # "Loaded 8 menu items and N orders from /data/db.json"
```

### 8. Bind mount: back up and restore the data to a host folder

```powershell
mkdir backup
podman run --rm -v canteen-data:/data:ro -v "${PWD}/backup:/backup" docker.io/library/alpine tar czf /backup/canteen-data.tgz -C /data .
dir backup

# restore
podman run --rm -v canteen-data:/data -v "${PWD}/backup:/backup" docker.io/library/alpine tar xzf /backup/canteen-data.tgz -C /data
podman restart canteen-api
```

### 9. Tests

```powershell
cd backend
npm install
npm test                    # 6 unit tests: totals, validation, status rules, filter, daily count, persistence
cd ..
```

```bash
bash scripts/smoke-test.sh http://localhost:8085    # 11 end-to-end tests through nginx -> API
```

### 10. Push to and pull from a registry (Docker Hub)

Done in Ubuntu (WSL) with Podman. The images are public at `docker.io/avinash2508/canteen-api` and `docker.io/avinash2508/canteen-web`.

```bash
podman login docker.io

# tag the local images with the registry path
podman tag canteen-api:1.0 docker.io/avinash2508/canteen-api:1.0
podman tag canteen-web:1.0 docker.io/avinash2508/canteen-web:1.0

# push
podman push docker.io/avinash2508/canteen-api:1.0
podman push docker.io/avinash2508/canteen-web:1.0

# delete the local copies so the pull really downloads them
podman rm -f canteen-web canteen-api
podman rmi canteen-api:1.0 canteen-web:1.0 docker.io/avinash2508/canteen-api:1.0 docker.io/avinash2508/canteen-web:1.0

# pull
podman pull docker.io/avinash2508/canteen-api:1.0
podman pull docker.io/avinash2508/canteen-web:1.0

# run from the pulled images (any machine with Podman can do this - no source code needed)
podman network create canteen-net
podman volume create canteen-data
podman run -d --name canteen-api --network canteen-net -v canteen-data:/data docker.io/avinash2508/canteen-api:1.0
podman run -d --name canteen-web --network canteen-net -p 8085:80 docker.io/avinash2508/canteen-web:1.0
```

### 11. Clean up

```powershell
.\scripts\stop.ps1                      # or: podman rm -f canteen-web canteen-api
podman network rm canteen-net
podman volume rm canteen-data           # deletes all orders!
podman rmi canteen-web:1.0 canteen-api:1.0
```

---

## Troubleshooting

| Problem | How we found it | Fix |
|---|---|---|
| `Cannot connect to Podman ... connection refused` | `podman machine list` showed the VM was not running | `podman machine start` |
| `localhost:8080` showed an EnterpriseDB "Server is up and running" page and every API call returned 404 | `Get-NetTCPConnection -LocalPort 8080 -State Listen` showed `httpd` (the PostgreSQL PEM server) was using 8080 | Publish a different host port: `-p 8085:80` |
| Page loads but shows `Request failed (HTTP 502)` or `(HTTP 504)` | `podman ps` showed `canteen-api` was not running. `podman logs canteen-web` showed the upstream error | `podman start canteen-api`. Both containers must be on `canteen-net` (`podman inspect canteen-api --format '{{.NetworkSettings.Networks}}'`) |
| nginx can't find `canteen-api` | `podman network inspect canteen-net` didn't list the API container | Run it with `--network canteen-net` and `--name canteen-api` |
| `the container name "canteen-api" is already in use` | `podman ps -a` | `podman rm -f canteen-api` and run it again |
| `HEALTHCHECK` missing from `podman inspect` | Image was built in OCI format | Rebuild with `--format docker` |
| `EACCES: permission denied, open '/data/db.json.tmp'` | `podman exec canteen-api id` shows the app runs as user `node` | Use the named volume (Podman copies the image's `/data` ownership into it). For a Linux bind mount, add `:U` |
| In Git Bash, `podman exec canteen-api cat /data/db.json` looks for `C:/Program Files/Git/data/...` | Git Bash rewrites paths that start with `/` | Use PowerShell, or prefix the command with `MSYS_NO_PATHCONV=1` |
| Changes to the code don't show up | Old image still in use | Rebuild the image, then `podman rm -f` and run the container again (or `.\scripts\start.ps1`) |

## Running without Podman (development)

```powershell
# terminal 1 - API on http://localhost:3000 (data saved in backend/data)
cd backend; npm install; npm run dev

# terminal 2 - React dev server on http://localhost:5173 (forwards /api to port 3000)
cd frontend; npm install; npm run dev
```

## Upload to GitHub

```powershell
git init
git add .
git commit -m "Canteen pre-order system with Node.js, React and Podman"
git branch -M main
git remote add origin https://github.com/<your-username>/canteen-preorder-podman.git
git push -u origin main
```
