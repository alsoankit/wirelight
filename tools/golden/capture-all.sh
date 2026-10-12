#!/usr/bin/env bash
# Runs every golden capture script (except the original ip-link capture.sh, which has its own
# flat file layout) and rebuilds packages/shell/test/golden/manifest.json. Takes about 6 minutes.
# Needs no root. Usage: tools/golden/capture-all.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
for s in bridge ipv4 route sysctl tcpdump; do
  echo "capture-$s.sh"
  "$here/capture-$s.sh"
done
