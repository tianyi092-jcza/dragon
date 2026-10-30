#!/bin/sh
# Root-only, editor-project-only, quiesced local backup + isolated SQLite check.
# Not off-host disaster recovery, cloud-root rollback or deleted-data retention.
set -eu
[ "$(id -u)" = 0 ] || { echo 'root required' >&2; exit 1; }
umask 077
cd /srv/dragon-editor/publication
# An absent database is not an empty, verified backup. Refuse before stopping
# the service; never silently substitute a newly created SQLite file.
[ -f publication-data/editor.sqlite ] && [ ! -L publication-data/editor.sqlite ] || { echo 'regular source database required' >&2; exit 1; }
check_data_tree() {
  [ -d "$1" ] && [ ! -L "$1" ] || { echo 'backup data tree must be a regular directory' >&2; exit 1; }
  # Neither a link to the live database nor linked private object
  # bodies constitute an independent restored copy. Reject special files too.
  unusual=$(find "$1" ! -type d ! -type f -print) || exit 1
  [ -z "$unusual" ] || { echo 'backup data tree contains links or special files' >&2; exit 1; }
}
# NUL-delimited directory names and sha256sum's escaped file names preserve
# spaces/newlines. Separate commands (not pipelines) propagate read failures.
record_data_tree() (
  cd "$1"
  find . -type d -print0 > "$2.directories-unsorted"
  LC_ALL=C sort -z "$2.directories-unsorted" > "$2.directories"
  find . -type f -print0 > "$2.files"
  xargs -0 -r sha256sum -- < "$2.files" > "$2.hashes-unsorted"
  LC_ALL=C sort "$2.hashes-unsorted" > "$2.sha256"
  rm "$2.directories-unsorted" "$2.files" "$2.hashes-unsorted"
)
check_backup_config() {
  for name in publication.env .env docker-compose.yml; do
    [ -f "$1/$name" ] && [ ! -L "$1/$name" ] || { echo 'regular backup configuration required' >&2; exit 1; }
  done
}
check_data_tree publication-data
check_backup_config .
exec 9>/run/lock/dragon-editor-publication-backup.lock
flock -n 9 || { echo 'backup already running' >&2; exit 1; }
backup=/root/dragon-editor-backups/publication-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 0700 "$backup"
running=$(docker compose ps --status running -q editor)
restart() {
  if [ -n "$running" ]; then
    # Consume the obligation before attempting it; a failed explicit restart
    # must not trigger a second, hidden attempt through the EXIT trap.
    running=''
    if ! docker compose up -d --no-build; then
      echo 'editor service restart failed' >&2
      return 1
    fi
  fi
}
cleanup() {
  result=$?
  trap - EXIT
  if ! restart; then
    # Keep the original backup/check failure if both operations failed.
    [ "$result" -ne 0 ] || result=1
  fi
  exit "$result"
}
trap cleanup EXIT
if [ -n "$running" ]; then docker compose stop editor; fi
# Recheck after the service has stopped, not only before its drain boundary.
check_data_tree publication-data
check_backup_config .
sha256sum publication.env .env docker-compose.yml > "$backup/source-config.sha256"
# Preserve exact private objects and DB as one stopped consistency boundary.
record_data_tree publication-data "$backup/source-tree"
tar -czf "$backup/private.tgz" publication-data publication.env .env docker-compose.yml
cp /home/web/conf.d/dragon-editor.720108.xyz.conf "$backup/editor-nginx.conf"
image_id=$(docker image inspect "dragon-editor-publication:$(cut -d= -f2 .env)" --format '{{.Id}}')
image_digest=${image_id#sha256:}
[ "$image_id" = "sha256:$image_digest" ] && [ "${#image_digest}" -eq 64 ] || { echo 'invalid backup image ID' >&2; exit 1; }
case "$image_digest" in *[!0-9a-f]*) echo 'invalid backup image ID' >&2; exit 1;; esac
printf '%s\n' "$image_id" > "$backup/image-id.txt"
# An ID alone cannot recover an image after loss of the original host/registry.
# Export the captured immutable identity, never resolve the mutable tag again.
# This adds image-layer disk usage and quiesced backup time; no image is loaded
# or service started from the archive during this local integrity check.
docker image save --output "$backup/image.tar" "$image_id"
[ -f "$backup/image.tar" ] && [ ! -L "$backup/image.tar" ] && [ -s "$backup/image.tar" ] || { echo 'regular nonempty image archive required' >&2; exit 1; }
(cd "$backup" && sha256sum private.tgz editor-nginx.conf image-id.txt image.tar source-tree.directories source-tree.sha256 source-config.sha256 > SHA256SUMS && sha256sum -c SHA256SUMS)
mkdir -m 0700 "$backup/restore-check"
tar -xzf "$backup/private.tgz" -C "$backup/restore-check" --no-same-owner
# SQLite integrity only, no application startup, restored session use or R2 IO.
check_backup_config "$backup/restore-check"
if ! (cd "$backup/restore-check" && sha256sum -c "$backup/source-config.sha256"); then
  echo 'backup configuration differs from stopped source' >&2
  exit 1
fi
check_data_tree "$backup/restore-check/publication-data"
[ -f "$backup/restore-check/publication-data/editor.sqlite" ] && [ ! -L "$backup/restore-check/publication-data/editor.sqlite" ] || { echo 'restored database missing or linked' >&2; exit 1; }
record_data_tree "$backup/restore-check/publication-data" "$backup/restored-tree"
if ! cmp -s "$backup/source-tree.directories" "$backup/restored-tree.directories" || ! cmp -s "$backup/source-tree.sha256" "$backup/restored-tree.sha256"; then
  echo 'restored data tree differs from stopped source' >&2
  exit 1
fi
    docker run --rm --network none --read-only --user 0:0 --cap-drop ALL \
        --security-opt no-new-privileges \
        -v "$backup/restore-check/publication-data:/restore:rw" \
        --entrypoint node "$image_id" \
        --input-type=module -e "import{DatabaseSync}from'node:sqlite';const db=new DatabaseSync('/restore/editor.sqlite',{readOnly:true});if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')process.exit(1);db.close();console.log('isolated SQLite restore integrity OK')"
# Report success only after the previously running project was restarted.
# This acknowledges compose execution, not readiness: strict startup archive/
# preflight may take time and readiness must still be checked separately.
restart
printf 'local editor backup and isolated restore check: %s\n' "$backup"
