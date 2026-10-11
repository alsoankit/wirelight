#!/usr/bin/env bash
# Captures real Linux output for the shell's golden tests (SRS NFR-09).
#
# Builds the Floor 0 topology (observatory eth0 02:00:00:00:00:05 — lantern eth0 02:00:00:00:00:07)
# as two network namespaces joined by a veth pair, runs each case inside `observatory`, and saves
# "$ command", the combined output, and the exit code to packages/shell/test/golden/<case>.txt.
#
# Needs no root: it runs inside an unprivileged user + mount + network namespace (`unshare -rmn`).
# Usage: tools/golden/capture.sh
set -euo pipefail
out="$(cd "$(dirname "$0")/../.." && pwd)/packages/shell/test/golden"
mkdir -p "$out"

exec unshare -rmn bash -s "$out" <<'INNER'
set -uo pipefail
out="$1"
mount -t tmpfs none /run && mkdir -p /run/netns

fresh() { # fresh <obs-eth0-state: up|down|never> <lantern-eth0-state: up|down>
  ip netns del obs 2>/dev/null; ip netns del lan 2>/dev/null
  ip netns add obs; ip netns add lan
  ip -n obs link set lo up; ip -n lan link set lo up
  ip -n obs link add eth0 address 02:00:00:00:00:05 type veth peer name eth0 netns lan address 02:00:00:00:00:07
  [ "$2" = up ] && ip -n lan link set eth0 up
  case "$1" in
    up) ip -n obs link set eth0 up ;;
    down) ip -n obs link set eth0 up; ip -n obs link set eth0 down ;;
    never) ;;
  esac
  # Carrier on a fresh veth settles asynchronously; wait until the kernel reports the final state.
  if [ "$1" = up ] && [ "$2" = up ]; then
    for _ in $(seq 50); do ip -n obs link show eth0 | grep -q 'state UP' && break; sleep 0.05; done
  fi
  sleep 0.1
}

case_() { # case_ <name> <obs-state> <lantern-state> <command...>
  local name="$1" o="$2" l="$3"; shift 3
  fresh "$o" "$l"
  {
    echo "# obs=$o lantern=$l"
    echo "\$ $*"
    ip netns exec obs "$@" 2>&1
    echo "[exit $?]"
  } > "$out/$name.txt"
}

case_ ip-link-up             up    up   ip link
case_ ip-link-never-up       never up   ip link
case_ ip-link-admin-down     down  up   ip link
case_ ip-link-no-carrier     up    down ip link
case_ ip-link-show           up    up   ip link show
case_ ip-link-list           up    up   ip link list
case_ ip-l                   up    up   ip l
case_ ip-link-show-eth0      up    up   ip link show eth0
case_ ip-link-show-dev-eth0  never up   ip link show dev eth0
case_ ip-link-show-lo        up    up   ip link show lo
case_ ip-link-show-missing   up    up   ip link show eth9
case_ ip-link-set-up         never up   ip link set eth0 up
case_ ip-link-set-dev-down   up    up   ip link set dev eth0 down
case_ ip-link-set-missing    up    up   ip link set eth9 up
case_ ip-link-set-garbage    up    up   ip link set eth0 sideways
case_ ip-link-set-noaction   up    up   ip link set eth0
case_ ip-link-set-nodev      up    up   ip link set
case_ ip-link-unknown-cmd    up    up   ip link frobnicate
case_ ip-unknown-object      up    up   ip frobnicate
case_ ip-link-show-two       up    up   ip link show eth0 lo
INNER
