#!/usr/bin/env bash
set -euo pipefail

STORAGE_ROOT="${STORAGE_ROOT:-/srv/teamgame}"
BACKUP_ROOT="${BACKUP_ROOT:-${STORAGE_ROOT}/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PATH="${BACKUP_ROOT}/teamgame-${STAMP}.tar.gz"

mkdir -p "${BACKUP_ROOT}"
umask 077
tar -czf "${BACKUP_PATH}" -C "${STORAGE_ROOT}" data uploads
printf 'Full backup created: %s\n' "${BACKUP_PATH}"
