#!/bin/sh
# sandbox stop 後所有進程與隧道連線都會消失；start 後跑這支把環境拉起來。
set -e
cd /data/dragon
docker compose --env-file env/.env up -d
sudo systemctl restart dragon-editor-proxy.service
sudo systemctl restart dragon-tunnel.service
sleep 8
systemctl is-active dragon-editor-proxy dragon-tunnel
docker compose --env-file env/.env ps
