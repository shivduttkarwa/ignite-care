#!/usr/bin/env bash
# Nightly backup of the database and the record PDFs. Runs from /etc/cron.d/ignite as the ignite user.
set -euo pipefail

APP=/srv/ignite/app
BACKUPS=/srv/ignite/backups
KEEP_DAYS=14
stamp=$(date +%Y-%m-%d)

mkdir -p "$BACKUPS/database" "$BACKUPS/media"

pg_dump --format=custom --no-owner --file="$BACKUPS/database/ignite-$stamp.dump" ignite
# Record PDFs are never deleted by the portal, so the mirror only ever grows.
rsync -a "$APP/var/media/" "$BACKUPS/media/"
find "$BACKUPS/database" -name '*.dump' -mtime +"$KEEP_DAYS" -delete

remote=$(grep -s '^BACKUP_REMOTE=' "$APP/.env" | cut -d= -f2- || true)
if [[ -n $remote ]]; then
  rclone copy "$BACKUPS" "$remote" --transfers 4
fi

echo "Backup $stamp done, $(du -sh "$BACKUPS" | cut -f1) on the server${remote:+, copied to $remote}"
