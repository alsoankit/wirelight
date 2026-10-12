#!/usr/bin/env bash
# Captures real Linux output for `sysctl` (read, -w, -a | grep, errors), run on the router.
#
# Topology "routed" (see lib.sh), commands on bridgehead. Net sysctls are per network namespace,
# so each case starts from the kernel default (ip_forward = 0) unless a step changes it.
# `sysctl -a` runs with stderr dropped (see lib.sh: user-namespace "permission denied" noise).
# Normalisation and environment choices (IPv6 off): see lib.sh.
# Needs no root. Usage: tools/golden/capture-sysctl.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"
start_family sysctl sysctl
R='routed off'; ON='routed on'; B=bridgehead
case_ sysctl-read             "$R"  $B 'sysctl net.ipv4.ip_forward'
case_ sysctl-read-on          "$ON" $B 'sysctl net.ipv4.ip_forward'
case_ sysctl-read-slash       "$R"  $B 'sysctl net/ipv4/ip_forward'
case_ sysctl-read-two         "$R"  $B 'sysctl net.ipv4.ip_forward net.ipv4.ip_default_ttl'
case_ sysctl-read-conf        "$R"  $B 'sysctl net.ipv4.conf.eth0.forwarding'
case_ sysctl-read-conf-on     "$ON" $B 'sysctl net.ipv4.conf.eth0.forwarding'
case_ sysctl-write-on         "$R"  $B 'sysctl -w net.ipv4.ip_forward=1'
case_ sysctl-write-off        "$ON" $B 'sysctl -w net.ipv4.ip_forward=0'
case_ sysctl-write-same       "$R"  $B 'sysctl -w net.ipv4.ip_forward=0'
case_ sysctl-write-two        "$R"  $B 'sysctl -w net.ipv4.ip_forward=2'
case_ sysctl-write-garbage    "$R"  $B 'sysctl -w net.ipv4.ip_forward=yes'
case_ sysctl-write-empty      "$R"  $B 'sysctl -w net.ipv4.ip_forward='
case_ sysctl-write-no-equals  "$R"  $B 'sysctl -w net.ipv4.ip_forward'
case_ sysctl-write-spaces     "$R"  $B 'sysctl -w net.ipv4.ip_forward = 1'
case_ sysctl-write-unknown    "$R"  $B 'sysctl -w net.ipv4.ip_frobnicate=1'
case_ sysctl-set-no-w         "$R"  $B 'sysctl net.ipv4.ip_forward=1'
case_ sysctl-read-after-write "$R"  $B 'sysctl net.ipv4.ip_forward' "$B|sysctl -w net.ipv4.ip_forward=1"
case_ sysctl-unknown          "$R"  $B 'sysctl net.ipv4.ip_frobnicate'
case_ sysctl-unknown-top      "$R"  $B 'sysctl frobnicate'
case_ sysctl-a-grep           "$R"  $B 'sysctl -a | grep ip_forward'
case_ sysctl-a-grep-on        "$ON" $B 'sysctl -a | grep ip_forward'
case_ sysctl-a-grep-forwarding "$ON" $B 'sysctl -a | grep forwarding'
case_ sysctl-a-grep-i         "$R"  $B 'sysctl -a | grep -i IP_FORWARD'
case_ sysctl-a-grep-v         "$R"  $B 'sysctl -a | grep ip_forward | grep -v update'
case_ sysctl-a-grep-none      "$R"  $B 'sysctl -a | grep frobnicate'
case_ sysctl-a-grep-neigh-eth0 "$R" $B 'sysctl -a | grep neigh.eth0'
case_ sysctl-no-args          "$R"  $B 'sysctl'
case_ sysctl-bad-option       "$R"  $B 'sysctl -x'
finish
INNER
