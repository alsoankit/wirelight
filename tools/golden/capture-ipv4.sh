#!/usr/bin/env bash
# Captures real Linux output for `ip addr`, `ip neigh` and `ping` on one segment.
#
# Topology "lan" (see lib.sh): observatory eth0 02:00:00:00:00:05 10.0.0.5/24 cabled to kitchen
# eth0 02:00:00:00:00:07 10.0.0.7/24. "lan-bare" is the same without IPv4 addresses.
# 10.0.0.9 is an address nobody has (ARP goes unanswered); 192.168.1.1 has no route.
# Ping cases through a router live in capture-route.sh.
# Normalisation and environment choices (IPv6 off, ping timings): see lib.sh.
# Needs no root. Usage: tools/golden/capture-ipv4.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"

# ── ip addr ──────────────────────────────────────────────────────────────────────────────────
start_family addr ipv4
case_ ip-addr                 lan        observatory 'ip addr'
case_ ip-a                    lan        observatory 'ip a'
case_ ip-addr-show            lan        observatory 'ip addr show'
case_ ip-addr-show-dev        lan        observatory 'ip addr show dev eth0'
case_ ip-addr-show-eth0       lan        observatory 'ip addr show eth0'
case_ ip-addr-show-lo         lan        observatory 'ip addr show dev lo'
case_ ip-addr-show-missing    lan        observatory 'ip addr show dev eth9'
case_ ip-addr-bare            'lan bare' observatory 'ip addr'
case_ ip-addr-door-down       lan        observatory 'ip addr' 'observatory|ip link set eth0 down'
case_ ip-addr-no-carrier      lan        observatory 'ip addr' 'kitchen|ip link set eth0 down'
case_ ip-addr-add             'lan bare' observatory 'ip addr add 10.0.0.5/24 dev eth0'
case_ ip-addr-after-add       'lan bare' observatory 'ip addr show dev eth0' 'observatory|ip addr add 10.0.0.5/24 dev eth0'
case_ ip-addr-add-noprefix    'lan bare' observatory 'ip addr add 10.0.0.5 dev eth0'
case_ ip-addr-after-add-noprefix 'lan bare' observatory 'ip addr show dev eth0' 'observatory|ip addr add 10.0.0.5 dev eth0'
case_ ip-addr-add-exists      lan        observatory 'ip addr add 10.0.0.5/24 dev eth0'
case_ ip-addr-add-second      lan        observatory 'ip addr add 10.0.0.6/24 dev eth0'
case_ ip-addr-after-add-second lan       observatory 'ip addr show dev eth0' 'observatory|ip addr add 10.0.0.6/24 dev eth0'
case_ ip-addr-add-other-net   lan        observatory 'ip addr show dev eth0' 'observatory|ip addr add 10.9.0.5/16 dev eth0'
case_ ip-addr-add-missing-dev 'lan bare' observatory 'ip addr add 10.0.0.5/24 dev eth9'
case_ ip-addr-add-no-dev      'lan bare' observatory 'ip addr add 10.0.0.5/24'
case_ ip-addr-add-bad-addr    'lan bare' observatory 'ip addr add 10.0.0.300/24 dev eth0'
case_ ip-addr-add-bad-prefix  'lan bare' observatory 'ip addr add 10.0.0.5/33 dev eth0'
case_ ip-addr-add-no-addr     'lan bare' observatory 'ip addr add dev eth0'
case_ ip-addr-add-down        'lan bare' observatory 'ip addr show dev eth0' 'observatory|ip link set eth0 down' 'observatory|ip addr add 10.0.0.5/24 dev eth0'
case_ ip-addr-del             lan        observatory 'ip addr del 10.0.0.5/24 dev eth0'
case_ ip-addr-after-del       lan        observatory 'ip addr show dev eth0' 'observatory|ip addr del 10.0.0.5/24 dev eth0'
case_ ip-addr-del-noprefix    lan        observatory 'ip addr del 10.0.0.5 dev eth0'
case_ ip-addr-del-wrong-prefix lan       observatory 'ip addr del 10.0.0.5/16 dev eth0'
case_ ip-addr-del-missing     lan        observatory 'ip addr del 10.0.0.6/24 dev eth0'
case_ ip-addr-del-missing-dev lan        observatory 'ip addr del 10.0.0.5/24 dev eth9'
case_ ip-addr-del-no-dev      lan        observatory 'ip addr del 10.0.0.5/24'
case_ ip-addr-flush           lan        observatory 'ip addr flush dev eth0'
case_ ip-addr-after-flush     lan        observatory 'ip addr show dev eth0' 'observatory|ip addr flush dev eth0'
case_ ip-addr-flush-empty     'lan bare' observatory 'ip addr flush dev eth0'
case_ ip-addr-flush-no-dev    lan        observatory 'ip addr flush'
case_ ip-addr-flush-missing   lan        observatory 'ip addr flush dev eth9'
case_ ip-addr-unknown-cmd     lan        observatory 'ip addr frobnicate'

# ── ip neigh ─────────────────────────────────────────────────────────────────────────────────
# Reaching STALE quickly: base_reachable_time_ms=1000 (REACHABLE lasts 0.5-1.5 s) and
# delay_first_probe_time=0. With the default 5 s delay the entry, having been used recently, goes
# REACHABLE -> DELAY -> probe -> REACHABLE every ~6 s and never STALE (measured, LINUX-FACTS.md).
start_family neigh ipv4
ping7='observatory|ping -c 1 -W 1 10.0.0.7'
fast='observatory|sysctl -w net.ipv4.neigh.eth0.base_reachable_time_ms=1000 net.ipv4.neigh.eth0.delay_first_probe_time=0'
case_ neigh-fresh             lan observatory 'ip neigh'
case_ ip-n                    lan observatory 'ip n' "$ping7"
case_ neigh-reachable         lan observatory 'ip neigh' "$ping7"
case_ neigh-show              lan observatory 'ip neigh show' "$ping7"
case_ neigh-show-dev          lan observatory 'ip neigh show dev eth0' "$ping7"
case_ neigh-show-dev-lo       lan observatory 'ip neigh show dev lo' "$ping7"
case_ neigh-show-missing-dev  lan observatory 'ip neigh show dev eth9'
stale=("$fast" "$ping7" 'wait:3')
slow='observatory|sysctl -w net.ipv4.neigh.eth0.base_reachable_time_ms=30000 net.ipv4.neigh.eth0.delay_first_probe_time=5'
case_ neigh-stale             lan observatory 'ip neigh' "${stale[@]}"
case_ neigh-delay             lan observatory 'ip neigh' "${stale[@]}" "$slow" "$ping7"
case_ neigh-probe-reachable   lan observatory 'ip neigh' "${stale[@]}" "$slow" "$ping7" 'wait:7'
# kitchen stops answering ARP (address removed): DELAY (5 s) -> PROBE (3 unicast probes, 1 s apart) -> FAILED
case_ neigh-probe             lan observatory 'ip neigh' "${stale[@]}" "$slow" 'kitchen|ip addr flush dev eth0' "$ping7" 'wait:6'
case_ neigh-probe-failed      lan observatory 'ip neigh' "${stale[@]}" "$slow" 'kitchen|ip addr flush dev eth0' "$ping7" 'wait:10'
# The other side: kitchen learns observatory from its ARP request (STALE), then uses it for the reply.
case_ neigh-learned-from-request lan kitchen  'ip neigh' "$ping7"
case_ neigh-learned-later     lan kitchen     'ip neigh' "$ping7" 'wait:7'
case_ neigh-incomplete        lan observatory 'ip neigh' 'observatory|timeout 5 ping -c 1 -W 4 10.0.0.9 &' 'wait:0.5'
case_ neigh-failed            lan observatory 'ip neigh' 'observatory|ping -c 1 -W 1 10.0.0.9' 'wait:3'
case_ neigh-permanent         lan observatory 'ip neigh' 'observatory|ip neigh add 10.0.0.7 lladdr 02:00:00:00:00:07 dev eth0 nud permanent'
case_ neigh-del               lan observatory 'ip neigh del 10.0.0.7 dev eth0' "$ping7"
case_ neigh-after-del         lan observatory 'ip neigh' "$ping7" 'observatory|ip neigh del 10.0.0.7 dev eth0'
case_ neigh-del-missing       lan observatory 'ip neigh del 10.0.0.7 dev eth0'
case_ neigh-del-no-dev        lan observatory 'ip neigh del 10.0.0.7' "$ping7"
case_ neigh-del-missing-dev   lan observatory 'ip neigh del 10.0.0.7 dev eth9'
case_ neigh-flush             lan observatory 'ip neigh flush dev eth0' "$ping7"
case_ neigh-after-flush       lan observatory 'ip neigh' "$ping7" 'observatory|ip neigh flush dev eth0'
case_ neigh-flush-failed      lan observatory 'ip neigh flush dev eth0' 'observatory|ping -c 1 -W 1 10.0.0.9' 'wait:3'
case_ neigh-after-flush-failed lan observatory 'ip neigh' 'observatory|ping -c 1 -W 1 10.0.0.9' 'wait:3' 'observatory|ip neigh flush dev eth0'
case_ neigh-flush-permanent   lan observatory 'ip neigh' 'observatory|ip neigh add 10.0.0.7 lladdr 02:00:00:00:00:07 dev eth0 nud permanent' 'observatory|ip neigh flush dev eth0'
case_ neigh-flush-no-args     lan observatory 'ip neigh flush'
case_ neigh-unknown-cmd       lan observatory 'ip neigh frobnicate'

# ── ping ─────────────────────────────────────────────────────────────────────────────────────
start_family ping ipv4
case_ ping-c4                 lan observatory 'ping -c 4 10.0.0.7'
case_ ping-c1                 lan observatory 'ping -c 1 10.0.0.7'
case_ ping-n                  lan observatory 'ping -n -c 2 10.0.0.7'
case_ ping-t                  lan observatory 'ping -c 2 -t 5 10.0.0.7'
case_ ping-i                  lan observatory 'ping -c 3 -i 0.5 10.0.0.7'
case_ ping-W-reply            lan observatory 'ping -c 2 -W 2 10.0.0.7'
case_ ping-W-no-reply         lan observatory 'ping -c 1 -W 2 10.0.0.9'
case_ ping-self               lan observatory 'ping -c 2 10.0.0.5'
case_ ping-loopback           lan observatory 'ping -c 2 127.0.0.1'
fresh lan; interrupt ping-interrupted observatory 3.5 'ping 10.0.0.7'
case_ ping-host-unreachable   lan observatory 'ping -c 4 10.0.0.9'
case_ ping-host-unreachable-c1 lan observatory 'ping -c 1 10.0.0.9'
fresh lan; interrupt ping-host-unreachable-interrupted observatory 7.5 'ping 10.0.0.9'
case_ ping-network-unreachable lan observatory 'ping -c 1 192.168.1.1'
case_ ping-door-down          lan observatory 'ping -c 1 10.0.0.7' 'observatory|ip link set eth0 down'
case_ ping-no-address         'lan bare' observatory 'ping -c 1 10.0.0.7'
case_ ping-peer-down          lan observatory 'ping -c 2 -W 1 10.0.0.7' 'kitchen|ip link set eth0 down'
case_ ping-peer-no-address    lan observatory 'ping -c 2 10.0.0.7' 'kitchen|ip addr flush dev eth0'
case_ ping-no-dest            lan observatory 'ping'
case_ ping-c-no-dest          lan observatory 'ping -c 1'
case_ ping-bad-option         lan observatory 'ping -x 10.0.0.7'
case_ ping-c-zero             lan observatory 'ping -c 0 10.0.0.7'
case_ ping-c-garbage          lan observatory 'ping -c x 10.0.0.7'
case_ ping-t-too-big          lan observatory 'ping -c 1 -t 300 10.0.0.7'
case_ ping-W-garbage          lan observatory 'ping -c 1 -W x 10.0.0.7'
case_ ping-i-garbage          lan observatory 'ping -c 1 -i x 10.0.0.7'
case_ ping-bad-address        lan observatory 'ping -c 1 10.0.0.300'

# ── builtins that are real programs ──────────────────────────────────────────────────────────
start_family builtins ipv4
case_ hostname                lan observatory 'hostname'

finish
INNER
