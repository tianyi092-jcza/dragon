# 臥龍傳 測試環境（instabox sandbox）

2026-11 用戶決定：sadcloud（4C/3.9G）資源太低，編輯後台＋玩家端搬到這台 4C/8G 的 sandbox。

本目錄是**這台機器現行部署的原始檔**（非產品代碼）：部署時把這四個檔放到機器的
`/data/dragon/`（`proxy.mjs`、`docker-compose.yml`、`start.sh`、本說明），
env 檔不進倉庫（含帳號與憑證）。程式本體仍是倉庫根的 `server/`、`reader/`、`vps/`。

## 訪問
- 編輯後台：https://18990-agqwqhyt5emm6ckzagrgpj375a.instabox.tech
- 玩家端：  https://8789-agqwqhyt5emm6ckzagrgpj375a.instabox.tech
（只有 sandbox 運行時可訪問；stop 後 URL 失效，start 後跑 ./start.sh）

## 為什麼要 proxy.mjs
instabox 的公網代理把 Host 改寫成 `127.0.0.1:<port>`，真主機名放在 `x-forwarded-host`；
編輯器要求 `Host` 逐字等於配置 origin 的 host（vps/editor-server.mjs:88），所以 18990 上的
極薄反代只做兩件事：①把 Host 還原成公網主機名再轉給 127.0.0.1:8788；②把
`deployment-assets/static-v1/<digest>/` 直接從本機 dist 供應（編輯器開機的靜態程式歸檔要讀它，
content-type 必須與 vps/static-client.mjs 白名單逐字相符）。
玩家端不需要反代：vps/player-server.mjs 用 PLAYER_ORIGIN 重建請求 URL，與 Host 無關。

## 佈局
- `data/`（700）SQLite；`private-objects/`（700）私有位元組；`bucket/`（700）磁碟桶；`dist/` 靜態發布
- `env/`：publication.env／editor.env／player.env／proxy.env／.env
- `docker-compose.yml`：editor 127.0.0.1:8788、player 127.0.0.1:8789
- `proxy.mjs` + systemd `dragon-editor-proxy.service`
- `start.sh`：compose up + 重啟反代與隧道（sandbox stop 後進程全消失，跑它恢復）

## 換域名（未來）
只要前面有一台帶你證書的公網入口（Cloudflare Tunnel 或小 VPS 反代），把
`env/publication.env` 的 EDITOR_ORIGIN／STATIC_ORIGIN 與 `env/player.env` 的 PLAYER_ORIGIN
改成新域名並 `docker compose up -d` 即可；程式不需改動。

## 遷移來源
sadcloud /srv/dragon：bucket 13606 物件（27212 檔含 .meta）、dist 1442、private-objects 569、
editor.sqlite 3.4 MB。鍵集合 md5 `381524459c4d853f5b86394fe2e2f4b2` 兩邊一致。

## 域名（2026-11-07：走 Cloudflare Tunnel，用户选择方案 1）

- 編輯後台 https://dragon-editor.720108.xyz → 隧道 → 127.0.0.1:18990（proxy）→ 8788
- 玩家端   https://dragon.720108.xyz → 隧道 → 127.0.0.1:8789（player，不需要 proxy）
- 隧道：`f5d35af4-bbb8-4abe-9ec4-cbc9ead29866`（名字 dragon），憑證 `/data/dragon/cloudflared/f5d35af4-….json`（600），
  設定 `/data/dragon/cloudflared/config.yml`，systemd `dragon-tunnel.service`。
- DNS：兩條 CNAME → `f5d35af4-….cfargotunnel.com`（proxied=true）。原本 CNAME 指向已刪除的舊隧道
  `fa6929ee-…`，所以域名一度回 530（Argo 1033）。
- **不再有 Worker CPU 上限**：CF 只做 TLS 反代（`server: cloudflare`、`cf-cache-status: DYNAMIC`），
  不再跑 Workers，1102 不會再出現。
- 舊的 `instabox-port` URL（8789 / 18990）保留作直連備援。
