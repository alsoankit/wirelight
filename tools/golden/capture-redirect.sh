#!/usr/bin/env bash
# Captures real Linux behaviour for ICMP redirects, routing loops and duplicate addresses
# (Floor 9 rooms 9.3, 9.4, 9.B; Floor 6 rooms 6.3, 6.B).
#
# Topology "cathedral": four streets as in Floor 9.
#   nave      10.0.1.0/24: observatory eth0 02:00:00:00:01:05 .5 <-> crossing eth0 02:00:00:00:01:01 .1
#   cloister  10.0.2.0/24: switch "cloister" (br0 over eth1, eth2, eth3) joining crossing eth1
#             02:00:00:00:02:01 .1, arch eth0 02:00:00:00:02:02 .2 and vesper eth0 02:00:00:00:02:07 .7
#   bell tower 10.0.3.0/24: arch eth1 02:00:00:00:03:01 .1 <-> spire eth0 02:00:00:00:03:02 .2
#   high window 10.0.4.0/24: spire eth1 02:00:00:00:04:01 .1 <-> halo eth0 02:00:00:00:04:07 .7
#   Routes: observatory default via 10.0.1.1; vesper default via 10.0.2.1; crossing 10.0.3.0/24 and
#   10.0.4.0/24 via 10.0.2.2; arch default via 10.0.2.1 (no route for the high window: the 9.4 loop);
#   spire default via 10.0.3.1; halo default via 10.0.4.1. Forwarding on in crossing, arch, spire.
# Duplicate addresses use topology "switch-ip" (lib.sh) with c given b's address 10.0.0.2.
# Normalisation and environment choices (IPv6 off, kernel-default sysctls): see lib.sh.
# Needs no root. Usage: tools/golden/capture-redirect.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"

topo_cathedral() {
  ns_add observatory; ns_add crossing; ns_add cloister; ns_add arch; ns_add vesper; ns_add spire; ns_add halo
  cable observatory eth0 02:00:00:00:01:05 crossing eth0 02:00:00:00:01:01
  cable cloister eth1 02:00:00:00:02:a1 crossing eth1 02:00:00:00:02:01
  cable cloister eth2 02:00:00:00:02:a2 arch eth0 02:00:00:00:02:02
  cable cloister eth3 02:00:00:00:02:a3 vesper eth0 02:00:00:00:02:07
  cable arch eth1 02:00:00:00:03:01 spire eth0 02:00:00:00:03:02
  cable spire eth1 02:00:00:00:04:01 halo eth0 02:00:00:00:04:07
  ip -n cloister link add br0 type bridge vlan_default_pvid 0
  local p x
  for p in eth1 eth2 eth3; do ip -n cloister link set "$p" master br0; ip -n cloister link set "$p" up; done
  ip -n cloister link set br0 up
  for x in observatory:eth0 crossing:eth0 crossing:eth1 arch:eth0 arch:eth1 vesper:eth0 spire:eth0 spire:eth1 halo:eth0; do
    ip -n "${x%:*}" link set "${x#*:}" up
  done
  ip -n observatory addr add 10.0.1.5/24 dev eth0
  ip -n crossing addr add 10.0.1.1/24 dev eth0; ip -n crossing addr add 10.0.2.1/24 dev eth1
  ip -n arch addr add 10.0.2.2/24 dev eth0; ip -n arch addr add 10.0.3.1/24 dev eth1
  ip -n vesper addr add 10.0.2.7/24 dev eth0
  ip -n spire addr add 10.0.3.2/24 dev eth0; ip -n spire addr add 10.0.4.1/24 dev eth1
  ip -n halo addr add 10.0.4.7/24 dev eth0
  wait_up observatory eth0; wait_up crossing eth0 eth1; wait_up arch eth0 eth1; wait_up vesper eth0
  wait_up spire eth0 eth1; wait_up halo eth0; wait_up cloister eth1 eth2 eth3 br0
  ip -n observatory route add default via 10.0.1.1
  ip -n vesper route add default via 10.0.2.1
  ip -n crossing route add 10.0.3.0/24 via 10.0.2.2; ip -n crossing route add 10.0.4.0/24 via 10.0.2.2
  ip -n arch route add default via 10.0.2.1
  ip -n spire route add default via 10.0.3.1
  ip -n halo route add default via 10.0.4.1
  for x in crossing arch spire; do ip netns exec "$x" sysctl -qw net.ipv4.ip_forward=1; done
  TOPO=cathedral
  TOPO_DESC="cathedral: observatory eth0 02:00:00:00:01:05 10.0.1.5/24 <-> crossing eth0 02:00:00:00:01:01 10.0.1.1/24; cloister switch br0 (vlan_default_pvid 0) over eth1 02:00:00:00:02:a1, eth2 02:00:00:00:02:a2, eth3 02:00:00:00:02:a3 cabled to crossing eth1 02:00:00:00:02:01 10.0.2.1/24, arch eth0 02:00:00:00:02:02 10.0.2.2/24, vesper eth0 02:00:00:00:02:07 10.0.2.7/24; arch eth1 02:00:00:00:03:01 10.0.3.1/24 <-> spire eth0 02:00:00:00:03:02 10.0.3.2/24; spire eth1 02:00:00:00:04:01 10.0.4.1/24 <-> halo eth0 02:00:00:00:04:07 10.0.4.7/24; observatory default via 10.0.1.1; vesper default via 10.0.2.1; crossing 10.0.3.0/24 and 10.0.4.0/24 via 10.0.2.2; arch default via 10.0.2.1; spire default via 10.0.3.1; halo default via 10.0.4.1; ip_forward=1 on crossing, arch, spire; all up; IPv6 off"
  # br0 sends two IGMP reports after it comes up; let them pass.
  sleep 2.5
}

C=cathedral
FIX='arch|ip route add 10.0.4.0/24 via 10.0.3.2'
V2='vesper|ping -c 2 10.0.3.2'
V3='vesper|ping -c 3 10.0.3.2'   # the third ping goes out through the exception

# ── ping: the routing loop (9.3, 9.4) and redirects ──────────────────────────────────────────
start_family ping redirect
case_ ping-loop                   $C observatory 'ping -c 3 10.0.4.7'
case_ ping-loop-ttl-1             $C observatory 'ping -c 1 -t 1 10.0.4.7'
case_ ping-loop-ttl-2             $C observatory 'ping -c 1 -t 2 10.0.4.7'
case_ ping-loop-fixed             $C observatory 'ping -c 2 10.0.4.7' "$FIX"
# A house on the cloister sending through crossing to arch: crossing redirects it.
case_ ping-redirect               $C vesper 'ping -c 3 10.0.3.2'
case_ ping-redirect-after         $C vesper 'ping -c 2 10.0.3.2' "$V2"
case_ ping-redirect-loop          $C vesper 'ping -c 3 -W 1 10.0.4.7'
case_ ping-redirect-loop-fast     $C vesper 'ping -c 30 -i 0.2 -W 1 10.0.4.7'
case_ ping-redirect-loop-ttl-2    $C vesper 'ping -c 1 -t 2 10.0.4.7'
case_ ping-redirect-refused       $C vesper 'ping -c 3 10.0.3.2' \
  'vesper|sysctl -w net.ipv4.conf.all.accept_redirects=0 net.ipv4.conf.eth0.accept_redirects=0'
case_ ping-redirect-not-sent      $C vesper 'ping -c 2 10.0.3.2' \
  'crossing|sysctl -w net.ipv4.conf.all.send_redirects=0 net.ipv4.conf.eth1.send_redirects=0'

# ── ip route: the exceptions a redirect leaves ───────────────────────────────────────────────
start_family route redirect
case_ route-get-redirected        $C vesper 'ip route get 10.0.3.2' "$V2"
case_ route-get-not-redirected    $C vesper 'ip route get 10.0.3.2' 'vesper|ping -c 1 10.0.3.2'
# `ip route show cache` lists an exception only once a packet has gone out through it.
case_ route-show-cache-unused     $C vesper 'ip route show cache' "$V2"
case_ route-show-cache            $C vesper 'ip route show cache' "$V3"
case_ route-show-cache-empty      $C vesper 'ip route show cache'
case_ route-show-cache-shared     $C vesper 'ip route show cache' "$V3" 'vesper|ip route add 10.9.0.0/16 via 10.0.2.1'
case_ route-flush-cache           $C vesper 'ip route flush cache' "$V3"
case_ route-after-flush-cache     $C vesper 'ip route show cache' "$V3" 'vesper|ip route flush cache'
case_ route-cache-door-down       $C vesper 'ip route show cache' "$V3" 'vesper|ip link set eth0 down' \
  'vesper|ip link set eth0 up' 'vesper|ip route add default via 10.0.2.1'
case_ route-get-loop              $C observatory 'ip route get 10.0.4.7' 'observatory|ping -c 2 10.0.4.7'
case_ sysctl-forward-accept-redirects $C crossing 'sysctl net.ipv4.conf.all.accept_redirects'

# ── tcpdump and bytes ────────────────────────────────────────────────────────────────────────
T() { fresh $1; capture "${@:2}"; }
start_family tcpdump redirect
T $C tcpdump-redirect             vesper 'tcpdump -n -c 3 -i eth0 icmp' 6 'vesper|ping -c 1 10.0.3.2'
T $C tcpdump-loop                 observatory 'tcpdump -n -c 2 -i eth0 icmp' 6 'observatory|ping -c 1 10.0.4.7'
start_family bytes redirect
T $C icmp-redirect                vesper 'tcpdump -n -e -xx -c 3 -i eth0 icmp' 6 'vesper|ping -c 1 -t 2 10.0.4.7'

# ── duplicate addresses (6.3, 6.B, 7.B) ──────────────────────────────────────────────────────
S='switch ip'
DUP=('c|ip addr flush dev eth0' 'c|ip addr add 10.0.0.2/24 dev eth0')
P1='a|ping -c 1 10.0.0.2'
FAST='a|sysctl -w net.ipv4.neigh.eth0.base_reachable_time_ms=1000 net.ipv4.neigh.eth0.delay_first_probe_time=0'
start_family neigh dup
case_ neigh-dup-first-reply       "$S" a 'ip neigh' "${DUP[@]}" "$P1"
case_ neigh-dup-other-b           "$S" b 'ip neigh' "${DUP[@]}" "$P1"
case_ neigh-dup-other-c           "$S" c 'ip neigh' "${DUP[@]}" "$P1"
# The other one asks a something: its request overrides a's entry.
case_ neigh-dup-flip              "$S" a 'ip neigh' "${DUP[@]}" "$P1" 'wait:1.5' 'b|ip neigh flush dev eth0' 'b|ping -c 1 10.0.0.1'
# The other one asks someone else: a hears it, and its entry changes too (after locktime).
case_ neigh-dup-heard             "$S" a 'ip neigh' "${DUP[@]}" "$P1" 'wait:1.5' 'b|ping -c 1 -W 1 10.0.0.9'
# The winner gives the address up: a keeps sending to it until the entry fails.
case_ neigh-dup-removed           "$S" a 'ip neigh' "${DUP[@]}" "$P1" 'c|ip addr del 10.0.0.2/24 dev eth0' 'a|ping -c 2 -W 1 10.0.0.2'
case_ neigh-dup-recovered         "$S" a 'ip neigh' "${DUP[@]}" "$FAST" "$P1" 'c|ip addr del 10.0.0.2/24 dev eth0' \
  'wait:2' 'a|ping -c 1 -W 1 10.0.0.2' 'wait:4' 'a|ping -c 2 10.0.0.2'
# A permanent entry pointing at a door that isn't there (6.B)
PERM='a|ip neigh add 10.0.0.2 lladdr 02:00:00:00:00:99 dev eth0 nud permanent'
case_ neigh-permanent-old-door    "$S" a 'ip neigh' "$PERM" 'a|ping -c 2 -W 1 10.0.0.2'
start_family ping dup
case_ ping-dup                    "$S" a 'ping -c 2 10.0.0.2' "${DUP[@]}"
case_ ping-dup-removed            "$S" a 'ping -c 3 -W 1 10.0.0.2' "${DUP[@]}" "$P1" 'c|ip addr del 10.0.0.2/24 dev eth0'
case_ ping-dup-recovered          "$S" a 'ping -c 2 10.0.0.2' "${DUP[@]}" "$FAST" "$P1" 'c|ip addr del 10.0.0.2/24 dev eth0' \
  'wait:2' 'a|ping -c 1 -W 1 10.0.0.2' 'wait:4'
case_ ping-dup-flipped            "$S" a 'ping -c 2 10.0.0.2' "${DUP[@]}" "$P1" 'wait:1.5' 'b|ip neigh flush dev eth0' 'b|ping -c 1 10.0.0.1'
case_ ping-permanent-old-door     "$S" a 'ping -c 2 -W 1 10.0.0.2' "$PERM"
case_ ping-permanent-deleted      "$S" a 'ping -c 2 10.0.0.2' "$PERM" 'a|ping -c 1 -W 1 10.0.0.2' 'a|ip neigh del 10.0.0.2 dev eth0'
start_family tcpdump dup
fresh switch ip; on c 'ip addr flush dev eth0'; on c 'ip addr add 10.0.0.2/24 dev eth0'
capture tcpdump-dup a 'tcpdump -n -e -c 5 -i eth0' 6 "$P1"
finish
INNER
