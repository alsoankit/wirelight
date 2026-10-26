#!/usr/bin/env bash
# Runs every golden capture script (except the original ip-link capture.sh, which has its own
# flat file layout) and rebuilds packages/shell/test/golden/manifest.json. Takes about 14 minutes (STP waits out its timers).
# Needs no root. Usage: tools/golden/capture-all.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
for s in bridge ipv4 help route sysctl tcpdump redirect stp; do
  echo "capture-$s.sh"
  "$here/capture-$s.sh"
done
# DHCP needs dhclient unpacked from Fedora's RPMs (see capture-dhcp.sh's header).
if [ -n "${DHCP_ROOT:-}" ]; then echo "capture-dhcp.sh"; "$here/capture-dhcp.sh"; else echo "capture-dhcp.sh skipped: DHCP_ROOT not set"; fi
