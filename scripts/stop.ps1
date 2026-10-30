# Stops and removes the containers. The network and the volume (your data) are kept.
# Usage: .\scripts\stop.ps1
podman stop canteen-web canteen-api
podman rm canteen-web canteen-api
podman ps -a --filter name=canteen
