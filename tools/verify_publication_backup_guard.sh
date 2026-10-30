#!/bin/sh
# Owned temporary filesystem + stub Docker/id/flock. Tests shell failure and
# restart boundaries, NOT real SQLite integrity, root permissions or deployment.
set -eu
repo=$(pwd)
PYTHON=${PYTHON:-python}
[ -f "$repo/vps/backup-publication.sh" ] || exit 1
root=$(mktemp -d)
cleanup() {
  status=$?
  if [ "$status" != 0 ] && [ -f "${own:-}/output" ]; then cat "$own/output" >&2; fi
  rm -rf "$root"
  exit "$status"
}
trap cleanup EXIT
mkdir "$root/bin"
REAL_TAR=$(command -v tar)
REAL_SHA=$(command -v sha256sum)
export REAL_TAR REAL_SHA
cat > "$root/bin/sha256sum" <<'STUB'
#!/bin/sh
if [ "${FAIL_TREE_HASH:-0}" = 1 ] && [ "$1" = -- ]; then
  echo 'owned tree hash read failed' >&2
  exit 1
fi
exec "$REAL_SHA" "$@"
STUB
cat > "$root/bin/id" <<'STUB'
#!/bin/sh
printf '0\n'
STUB
cat > "$root/bin/flock" <<'STUB'
#!/bin/sh
exit 0
STUB
cat > "$root/bin/docker" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >> "$CALL_LOG"
case "$*" in
  'compose ps --status running -q editor') if [ "${ALREADY_STOPPED:-0}" = 0 ]; then printf 'owned-container\n'; fi;;
  'compose up -d --no-build') exit "${RESTART_EXIT:-0}";;
  'compose stop editor')
    if [ "${STOP_LINK:-0}" = 1 ]; then ln -s "$LINK_TARGET" "$SOURCE_DATA/private-objects/stopped-link"; fi;;
  'image inspect '*)
    if [ "${IMAGE_INSPECT_FAIL:-0}" = 1 ]; then exit 7; fi
    printf '%s\n' "$IMAGE_ID";;
  'image save '*)
    [ "$#" = 5 ] && [ "$3" = --output ] && [ "$5" = "$EXPECTED_IMAGE_ID" ] || exit 9
    case "${IMAGE_EXPORT:-ok}" in
      failed) exit 7;;
      missing) :;;
      empty) : > "$4";;
      linked) ln -s "$LINK_TARGET" "$4";;
      *) printf 'owned Docker export fixture, not a loadable image\n' > "$4";;
    esac;;
  'run '*)
    case "$*" in *"--entrypoint node $EXPECTED_IMAGE_ID --input-type=module"*) :;; *) echo 'checker did not use captured image ID' >&2; exit 9;; esac
    exit "${CHECK_EXIT:-0}";;
esac
STUB
cat > "$root/bin/tar" <<'STUB'
#!/bin/sh
if [ "${DROP_OBJECT:-0}" = 1 ] && [ "$1" = -czf ]; then
  exec "$REAL_TAR" --force-local --exclude=publication-data/private-objects/body "$@"
fi
if [ "${DROP_EMPTY:-0}" = 1 ] && [ "$1" = -czf ]; then
  exec "$REAL_TAR" --force-local --exclude=publication-data/empty-directory "$@"
fi
if [ "${CHANGE_OBJECT:-0}" = 1 ] && [ "$1" = -xzf ]; then
  "$REAL_TAR" --force-local "$@" || exit $?
  printf 'other object\n' > "$4/publication-data/private-objects/body"
  exit 0
fi
if [ "${DROP_CONFIG:-0}" = 1 ] && [ "$1" = -czf ]; then
  exec "$REAL_TAR" --force-local --exclude=publication.env "$@"
fi
if [ -n "${CHANGE_CONFIG:-}" ] && [ "$1" = -xzf ]; then
  "$REAL_TAR" --force-local "$@" || exit $?
  printf 'altered owned configuration\n' > "$4/$CHANGE_CONFIG"
  exit 0
fi
if [ "${RESTORE_CONFIG_LINK:-0}" = 1 ] && [ "$1" = -xzf ]; then
  "$REAL_TAR" --force-local "$@" || exit $?
  rm "$4/publication.env"
  ln -s "$SOURCE_DATA/../publication.env" "$4/publication.env"
  exit 0
fi
if [ "${DROP_DB:-0}" = 1 ] && [ "$1" = -czf ]; then
  exec "$REAL_TAR" --force-local --exclude=publication-data/editor.sqlite "$@"
fi
if [ "${RESTORE_LINK:-0}" = 1 ] && [ "$1" = -xzf ]; then
  "$REAL_TAR" --force-local "$@" || exit $?
  mv "$4/publication-data" "$4/archived-data"
  ln -s "$SOURCE_DATA" "$4/publication-data"
  exit 0
fi
# Git Bash fixture paths may contain a drive colon; never treat it as rsh.
exec "$REAL_TAR" --force-local "$@"
STUB
chmod +x "$root/bin/"*
export PATH="$root/bin:$PATH"
modes='missing directory healthy dropped integrity-failed dropped-object changed-object dropped-empty hash-failed dropped-config changed-config changed-tag changed-compose missing-config directory-config empty-image invalid-image nonhex-image inspect-failed restart-failed integrity-and-restart-failed already-stopped export-failed export-missing export-empty'
# Opt in on a real symlink-capable filesystem (Linux /tmp), not MSYS ln copies.
if [ "${BACKUP_LINK_TESTS:-0}" = 1 ]; then modes="$modes linked-root linked-object special-file linked-restored post-stop-link linked-config linked-restored-config export-linked"; fi
for mode in $modes; do
  own="$root/$mode"
  mkdir -p "$own/project/publication-data/private-objects" "$own/project/publication-data/empty-directory" "$own/backups"
  printf 'owned fixture only\n' > "$own/project/publication.env"
  printf 'TAG=owned\n' > "$own/project/.env"
  printf 'owned compose fixture\n' > "$own/project/docker-compose.yml"
  printf 'owned nginx fixture\n' > "$own/nginx.conf"
  case "$mode" in
    missing) :;;
    directory) mkdir "$own/project/publication-data/editor.sqlite";;
    *) printf 'not a real SQLite database: Docker integrity is stubbed\n' > "$own/project/publication-data/editor.sqlite";;
  esac
  printf 'owned object\n' > "$own/project/publication-data/private-objects/body"
  printf '\000\377\012' > "$own/project/publication-data/private-objects/space name"
  if [ "${BACKUP_LINK_TESTS:-0}" = 1 ]; then
    # Linux filename escaping must not turn one file into two manifest rows.
    printf 'owned newline name\n' > "$own/project/publication-data/private-objects/line
break"
  fi
  printf 'owned link target\n' > "$own/link-target"
  if [ "$mode" = linked-root ]; then
    mv "$own/project/publication-data" "$own/linked-data"
    ln -s "$own/linked-data" "$own/project/publication-data"
    [ -L "$own/project/publication-data" ]
  elif [ "$mode" = linked-object ]; then
    ln -s "$own/link-target" "$own/project/publication-data/private-objects/link"
    [ -L "$own/project/publication-data/private-objects/link" ]
  elif [ "$mode" = special-file ]; then
    mkfifo "$own/project/publication-data/private-objects/pipe"
    [ -p "$own/project/publication-data/private-objects/pipe" ]
  fi
  case "$mode" in
    missing-config) rm "$own/project/publication.env";;
    directory-config) rm "$own/project/publication.env"; mkdir "$own/project/publication.env";;
    linked-config) rm "$own/project/publication.env"; ln -s "$own/link-target" "$own/project/publication.env"; [ -L "$own/project/publication.env" ];;
  esac
  # Only fixed deployment paths are redirected, with exact occurrence checks.
  # The product script itself is never executed against production paths.
  "$PYTHON" - "$repo" "$own" <<'PY'
from pathlib import Path
import shlex
import sys
repo, own = map(Path, sys.argv[1:])
text = (repo / 'vps/backup-publication.sh').read_text(encoding='utf-8')
replacements = {
    'cd /srv/dragon-editor/publication': 'cd ' + shlex.quote((own / 'project').as_posix()),
    '/run/lock/dragon-editor-publication-backup.lock': (own / 'lock').as_posix(),
    '/root/dragon-editor-backups/publication-': (own / 'backups/publication-').as_posix(),
    '/home/web/conf.d/dragon-editor.720108.xyz.conf': (own / 'nginx.conf').as_posix(),
}
for before, after in replacements.items():
    if text.count(before) != 1:
        raise ValueError('unexpected backup script path')
    text = text.replace(before, after)
(own / 'runner.sh').write_text(text, encoding='utf-8')
PY
  export CALL_LOG="$own/calls" DROP_DB=0 CHECK_EXIT=0 RESTORE_LINK=0 STOP_LINK=0 DROP_OBJECT=0 CHANGE_OBJECT=0 DROP_EMPTY=0 FAIL_TREE_HASH=0
  export SOURCE_DATA="$own/project/publication-data" LINK_TARGET="$own/link-target" DROP_CONFIG=0 CHANGE_CONFIG='' RESTORE_CONFIG_LINK=0
  export EXPECTED_IMAGE_ID=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  export IMAGE_ID="$EXPECTED_IMAGE_ID" IMAGE_INSPECT_FAIL=0 RESTART_EXIT=0 ALREADY_STOPPED=0 IMAGE_EXPORT=ok
  case "$mode" in export-*) IMAGE_EXPORT=${mode#export-};; esac
  [ "$mode" != already-stopped ] || ALREADY_STOPPED=1
  case "$mode" in restart-failed|integrity-and-restart-failed) RESTART_EXIT=9;; esac
  [ "$mode" != integrity-and-restart-failed ] || CHECK_EXIT=7
  [ "$mode" != empty-image ] || IMAGE_ID=''
  [ "$mode" != invalid-image ] || IMAGE_ID=owned-tag
  [ "$mode" != nonhex-image ] || IMAGE_ID=sha256:gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg
  [ "$mode" != inspect-failed ] || IMAGE_INSPECT_FAIL=1
  : > "$CALL_LOG"
  [ "$mode" != dropped-config ] || DROP_CONFIG=1
  [ "$mode" != changed-config ] || CHANGE_CONFIG=publication.env
  [ "$mode" != changed-tag ] || CHANGE_CONFIG=.env
  [ "$mode" != changed-compose ] || CHANGE_CONFIG=docker-compose.yml
  [ "$mode" != linked-restored-config ] || RESTORE_CONFIG_LINK=1
  [ "$mode" != dropped ] || DROP_DB=1
  [ "$mode" != dropped-object ] || DROP_OBJECT=1
  [ "$mode" != changed-object ] || CHANGE_OBJECT=1
  [ "$mode" != dropped-empty ] || DROP_EMPTY=1
  [ "$mode" != hash-failed ] || FAIL_TREE_HASH=1
  [ "$mode" != integrity-failed ] || CHECK_EXIT=7
  [ "$mode" != linked-restored ] || RESTORE_LINK=1
  [ "$mode" != post-stop-link ] || STOP_LINK=1
  result=0
  sh "$own/runner.sh" > "$own/output" 2>&1 || result=$?
  case "$mode" in
    healthy)
      [ "$result" = 0 ]
      grep -q '^local editor backup and isolated restore check:' "$own/output"
      grep -q '^run ' "$CALL_LOG"
      grep -q '^image save --output ' "$CALL_LOG"
      for saved in "$own"/backups/*/image.tar; do
        [ -s "$saved" ] && [ ! -L "$saved" ]
        grep -Eq '^[0-9a-f]{64} [ *]image[.]tar$' "$(dirname "$saved")/SHA256SUMS"
      done
      grep -q '^compose up -d --no-build$' "$CALL_LOG";;
    restart-failed|integrity-and-restart-failed)
      [ "$result" != 0 ]
      if [ "$mode" = integrity-and-restart-failed ]; then [ "$result" = 7 ]; fi
      if grep -q '^local editor backup and isolated restore check:' "$own/output"; then exit 1; fi
      grep -q 'editor service restart failed' "$own/output"
      [ "$(grep -c '^compose up -d --no-build$' "$CALL_LOG")" = 1 ];;
    already-stopped)
      [ "$result" = 0 ]
      grep -q '^local editor backup and isolated restore check:' "$own/output"
      grep -q '^run ' "$CALL_LOG"
      if grep -Eq '^compose (up|stop) ' "$CALL_LOG"; then exit 1; fi;;
    missing|directory)
      [ "$result" != 0 ]
      [ ! -s "$CALL_LOG" ]
      grep -q 'regular source database required' "$own/output";;
    empty-image|invalid-image|nonhex-image|inspect-failed)
      [ "$result" != 0 ]
      if grep -q '^local editor backup and isolated restore check:' "$own/output"; then exit 1; fi
      if grep -q '^run ' "$CALL_LOG"; then exit 1; fi
      if [ "$mode" != inspect-failed ]; then grep -q 'invalid backup image ID' "$own/output"; fi
      grep -q '^compose up -d --no-build$' "$CALL_LOG";;
    export-failed|export-missing|export-empty|export-linked)
      [ "$result" != 0 ]
      if [ "$mode" = export-failed ]; then [ "$result" = 7 ]; fi
      if grep -Eq '^local editor backup and isolated restore check:' "$own/output" || grep -q '^run ' "$CALL_LOG"; then exit 1; fi
      grep -q '^image save --output ' "$CALL_LOG"
      [ "$(grep -c '^compose up -d --no-build$' "$CALL_LOG")" = 1 ];;
    missing-config|directory-config|linked-config)
      [ "$result" != 0 ]
      [ ! -s "$CALL_LOG" ]
      grep -q 'regular backup configuration required' "$own/output";;
    dropped-config|changed-config|changed-tag|changed-compose|linked-restored-config)
      [ "$result" != 0 ]
      if grep -q '^local editor backup and isolated restore check:' "$own/output"; then exit 1; fi
      if grep -q '^run ' "$CALL_LOG"; then exit 1; fi
      grep -Eq 'regular backup configuration required|backup configuration differs' "$own/output"
      grep -q '^compose up -d --no-build$' "$CALL_LOG";;
    linked-root|linked-object|special-file)
      [ "$result" != 0 ]
      [ ! -s "$CALL_LOG" ]
      grep -q 'backup data tree' "$own/output";;
    linked-restored|post-stop-link)
      [ "$result" != 0 ]
      if grep -q '^local editor backup and isolated restore check:' "$own/output"; then exit 1; fi
      if grep -q '^run ' "$CALL_LOG"; then exit 1; fi
      grep -q 'backup data tree' "$own/output"
      grep -q '^compose stop editor$' "$CALL_LOG"
      grep -q '^compose up -d --no-build$' "$CALL_LOG";;
    hash-failed)
      [ "$result" != 0 ]
      if grep -q '^local editor backup and isolated restore check:' "$own/output"; then exit 1; fi
      if grep -q '^run ' "$CALL_LOG"; then exit 1; fi
      grep -q 'owned tree hash read failed' "$own/output"
      grep -q '^compose up -d --no-build$' "$CALL_LOG";;
    dropped-object|changed-object|dropped-empty)
      [ "$result" != 0 ]
      if grep -q '^local editor backup and isolated restore check:' "$own/output"; then exit 1; fi
      if grep -q '^run ' "$CALL_LOG"; then exit 1; fi
      grep -q 'restored data tree differs' "$own/output"
      grep -q '^compose up -d --no-build$' "$CALL_LOG";;
    dropped|integrity-failed)
      [ "$result" != 0 ]
      if grep -q '^local editor backup and isolated restore check:' "$own/output"; then exit 1; fi
      grep -q '^compose stop editor$' "$CALL_LOG"
      grep -q '^compose up -d --no-build$' "$CALL_LOG"
      if [ "$mode" = dropped ]; then
        if grep -q '^run ' "$CALL_LOG"; then exit 1; fi
        grep -q 'restored database missing or linked' "$own/output"
      fi;;
  esac
  printf 'PASS owned backup guard: %s\n' "$mode"
done
