# Builds the images and starts the whole app with Podman.
# Usage (from the project folder):  .\scripts\start.ps1
# Optional: .\scripts\start.ps1 -HostPort 8080
param([int]$HostPort = 8085)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

podman build --format docker -t canteen-api:1.0 ./backend
podman build --format docker -t canteen-web:1.0 ./frontend

# Network and volume are created only if they do not exist yet.
podman network exists canteen-net; if ($LASTEXITCODE -ne 0) { podman network create canteen-net }
podman volume exists canteen-data; if ($LASTEXITCODE -ne 0) { podman volume create canteen-data }

podman rm -f canteen-api canteen-web 2>$null

podman run -d --name canteen-api --network canteen-net `
  -v canteen-data:/data --restart unless-stopped canteen-api:1.0

podman run -d --name canteen-web --network canteen-net `
  -p "${HostPort}:80" --restart unless-stopped canteen-web:1.0

podman ps --filter name=canteen
Write-Host "`nOpen http://localhost:$HostPort"
