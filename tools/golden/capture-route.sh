#!/usr/bin/env bash
# Captures real Linux output for `ip route`, and `ping` across a router (TTL, ICMP errors).
#
# Topology "routed" (see lib.sh): left 10.0.1.10/24 — bridgehead (eth0 10.0.1.1/24, eth1 10.0.2.1/24)
# — right 10.0.2.20/24. Variants: routed-fwd-off / routed-fwd-on (bridgehead's net.ipv4.ip_forward),
# and "-nogw" where the hosts have only their connected route (no default route yet).
# 10.9.9.9 is on no network at all.
# Normalisation and environment choices (IPv6 off, ping timings): see lib.sh.
# Needs no root. Usage: tools/golden/capture-route.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"

# ── ip route ─────────────────────────────────────────────────────────────────────────────────
start_family route route
R='routed off'; N='routed off nogw'
case_ ip-route                "$R" left 'ip route'
case_ ip-r                    "$R" left 'ip r'
case_ ip-route-show           "$R" left 'ip route show'
case_ ip-route-nogw           "$N" left 'ip route'
case_ ip-route-router         "$R" bridgehead 'ip route'
case_ ip-route-door-down      "$R" left 'ip route' 'left|ip link set eth0 down'
case_ ip-route-no-carrier     "$R" left 'ip route' 'bridgehead|ip link set eth0 down'
case_ ip-route-no-address     "$R" left 'ip route' 'left|ip addr flush dev eth0'
# add
case_ route-add-default       "$N" left 'ip route add default via 10.0.1.1'
case_ route-after-add-default "$N" left 'ip route' 'left|ip route add default via 10.0.1.1'
case_ route-add-default-dev   "$N" left 'ip route add default via 10.0.1.1 dev eth0'
case_ route-add-default-exists "$R" left 'ip route add default via 10.0.1.1'
case_ route-add-default-other "$R" left 'ip route add default via 10.0.1.2'
case_ route-add-default-bad-gw "$N" left 'ip route add default via 10.0.2.1'
case_ route-add-default-gw-self "$N" left 'ip route add default via 10.0.1.10'
case_ route-add-net           "$N" left 'ip route add 10.0.2.0/24 via 10.0.1.1'
case_ route-add-net-dev       "$N" left 'ip route add 10.0.2.0/24 via 10.0.1.1 dev eth0'
case_ route-after-add-net     "$N" left 'ip route' 'left|ip route add 10.0.2.0/24 via 10.0.1.1'
case_ route-add-net-exists    "$N" left 'ip route add 10.0.2.0/24 via 10.0.1.1' 'left|ip route add 10.0.2.0/24 via 10.0.1.1'
case_ route-add-net-bad-gw    "$N" left 'ip route add 10.0.2.0/24 via 10.0.3.1'
case_ route-add-net-wrong-dev "$N" left 'ip route add 10.0.2.0/24 via 10.0.1.1 dev lo'
case_ route-add-net-missing-dev "$N" left 'ip route add 10.0.2.0/24 via 10.0.1.1 dev eth9'
case_ route-add-host-bits     "$N" left 'ip route add 10.0.2.5/24 via 10.0.1.1'
case_ route-add-bad-prefix    "$N" left 'ip route add 10.0.2.0/33 via 10.0.1.1'
case_ route-add-bad-addr      "$N" left 'ip route add 10.0.2.300/24 via 10.0.1.1'
case_ route-add-bad-gw-addr   "$N" left 'ip route add 10.0.2.0/24 via 10.0.1.300'
case_ route-add-no-via        "$N" left 'ip route add 10.0.2.0/24'
case_ route-add-host          "$N" left 'ip route add 10.0.2.20 via 10.0.1.1'
case_ route-after-add-host    "$N" left 'ip route' 'left|ip route add 10.0.2.20 via 10.0.1.1'
case_ route-add-dev-only      "$N" left 'ip route add 10.0.2.0/24 dev eth0'
case_ route-after-add-dev-only "$N" left 'ip route' 'left|ip route add 10.0.2.0/24 dev eth0'
case_ route-add-nothing       "$N" left 'ip route add'
case_ route-add-via-door-down "$N" left 'ip route add default via 10.0.1.1' 'left|ip link set eth0 down'
# del
case_ route-del-default       "$R" left 'ip route del default'
case_ route-after-del-default "$R" left 'ip route' 'left|ip route del default'
case_ route-del-default-via   "$R" left 'ip route del default via 10.0.1.1'
case_ route-del-default-wrong-via "$R" left 'ip route del default via 10.0.1.2'
case_ route-del-missing       "$N" left 'ip route del default'
case_ route-del-net           "$N" left 'ip route del 10.0.2.0/24' 'left|ip route add 10.0.2.0/24 via 10.0.1.1'
case_ route-del-net-via       "$N" left 'ip route del 10.0.2.0/24 via 10.0.1.1' 'left|ip route add 10.0.2.0/24 via 10.0.1.1'
case_ route-del-net-missing   "$N" left 'ip route del 10.0.2.0/24'
case_ route-del-connected     "$R" left 'ip route del 10.0.1.0/24'
case_ route-after-del-connected "$R" left 'ip route' 'left|ip route del 10.0.1.0/24'
case_ route-del-nothing       "$N" left 'ip route del'
# replace
case_ route-replace-new       "$N" left 'ip route replace default via 10.0.1.1'
case_ route-replace-existing  "$R" left 'ip route replace default via 10.0.1.1 dev eth0'
case_ route-replace-net       "$N" left 'ip route replace 10.0.2.0/24 via 10.0.1.1'
case_ route-after-replace     "$R" left 'ip route' 'left|ip route add 10.0.2.0/24 dev eth0' 'left|ip route replace 10.0.2.0/24 via 10.0.1.1'
case_ route-replace-bad-gw    "$R" left 'ip route replace default via 10.0.2.1'
# get
case_ route-get-remote        "$R" left 'ip route get 10.0.2.20'
case_ route-get-neighbour     "$R" left 'ip route get 10.0.1.1'
case_ route-get-self          "$R" left 'ip route get 10.0.1.10'
case_ route-get-loopback      "$R" left 'ip route get 127.0.0.1'
case_ route-get-unreachable   "$N" left 'ip route get 10.0.2.20'
case_ route-get-router        "$R" bridgehead 'ip route get 10.0.2.20'
case_ route-get-router-nowhere "$R" bridgehead 'ip route get 10.9.9.9'
case_ route-get-bad-addr      "$R" left 'ip route get 10.0.2.300'
case_ route-get-nothing       "$R" left 'ip route get'
case_ route-get-prefix        "$R" left 'ip route get 10.0.2.0/24'
# errors
case_ route-unknown-cmd       "$R" left 'ip route frobnicate'
case_ route-show-missing-dev  "$R" left 'ip route show dev eth9'
case_ route-show-dev          "$R" left 'ip route show dev eth0'

# ── ping across the router ───────────────────────────────────────────────────────────────────
start_family ping route
ON='routed on'
case_ ping-routed             "$ON" left 'ping -c 2 10.0.2.20'
case_ ping-routed-reverse     "$ON" right 'ping -c 2 10.0.1.10'
case_ ping-routed-fwd-off     "$R" left 'ping -c 2 -W 1 10.0.2.20'
case_ ping-router-near        "$R" left 'ping -c 1 10.0.1.1'
case_ ping-router-far-side    "$R" left 'ping -c 1 10.0.2.1'
case_ ping-ttl-1              "$ON" left 'ping -c 1 -t 1 10.0.2.20'
case_ ping-ttl-1-c3           "$ON" left 'ping -c 3 -t 1 10.0.2.20'
case_ ping-ttl-2              "$ON" left 'ping -c 1 -t 2 10.0.2.20'
case_ ping-ttl-1-router       "$ON" left 'ping -c 1 -t 1 10.0.1.1'
case_ ping-net-unreachable-router "$ON" left 'ping -c 2 10.9.9.9'
case_ ping-net-unreachable-fwd-off "$R" left 'ping -c 2 -W 1 10.9.9.9'
case_ ping-host-unreachable-router "$ON" left 'ping -c 4 10.0.2.20' 'right|ip addr flush dev eth0'
case_ ping-no-default-route   "$N" left 'ping -c 1 10.0.2.20'
case_ ping-no-return-route    'routed on nogw' left 'ping -c 2 -W 1 10.0.2.20' 'left|ip route add default via 10.0.1.1'
case_ ping-gw-wrong           'routed on nogw' left 'ping -c 2 10.0.2.20' 'left|ip route add default via 10.0.1.2'

finish
INNER
