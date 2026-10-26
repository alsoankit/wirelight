#!/usr/bin/env bash
# Captures real Linux output for asking `ip` for help: `ip help`, `ip` alone, and each object's `help`.
# iproute2 prints every usage to stderr and exits 255.
# Needs no root. Usage: tools/golden/capture-help.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"

start_family help ipv4
case_ ip-help                 lan observatory 'ip help'
case_ ip-bare                 lan observatory 'ip'
case_ ip-h                    lan observatory 'ip h'
case_ ip-link-help            lan observatory 'ip link help'
case_ ip-addr-help            lan observatory 'ip addr help'
case_ ip-address-help         lan observatory 'ip address help'
case_ ip-neigh-help           lan observatory 'ip neigh help'
case_ ip-route-help           lan observatory 'ip route help'
case_ ip-link-h               lan observatory 'ip link h'

finish
INNER
