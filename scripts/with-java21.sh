#!/usr/bin/env bash
# Runs a command with Java >= 21 on PATH. firebase-tools' emulators require
# Java 21+, but a machine's default `java` may be older (Ubuntu ships 17 as
# the default alternative). Honors JAVA21_HOME, else picks the first JDK >= 21
# under /usr/lib/jvm. Used by `npm run test:rules`.
set -euo pipefail
major() { "$1" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1; }
current=$(command -v java >/dev/null 2>&1 && major java || echo 0)
if [ "${current:-0}" -lt 21 ]; then
  for d in ${JAVA21_HOME:-} /usr/lib/jvm/*; do
    if [ -x "$d/bin/java" ] && [ "$(major "$d/bin/java")" -ge 21 ] 2>/dev/null; then
      export JAVA_HOME="$d"
      export PATH="$d/bin:$PATH"
      break
    fi
  done
fi
exec "$@"
