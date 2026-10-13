#!/usr/bin/env bash
# Captures real Linux output for the bridge's spanning tree (kernel STP, 802.1D): `bridge link`,
# `ip link set <br> type bridge stp_state|priority|…`, port states over time, failover, BPDUs.
#
# Topology "halls" (see topo_halls below): hall-a and hall-b, each a bridge br0 over eth1..eth3,
# joined twice (span: eth2—eth2, span-2: eth3—eth3: a loop), host a on hall-a eth1, host b on
# hall-b eth1. "halls" creates the bridges with STP off (the loop is closed but quiet: nothing
# broadcasts until a case pings); "halls-stp" creates them with `stp_state 1`.
#
# Timed cases: several cases share one topology run (a "timeline"): the run waits, captures a few
# commands at that moment, waits again… Each case's manifest entry lists every state step and wait
# before it, so the golden runner rebuilds it on its own. Read-only commands are not steps; a ping
# that changes state is recorded as one. Waits are chosen well inside each STP state (listening
# 0–15 s, learning 15–30 s, forwarding after ~31 s: forward_delay 15 s, rounded by the timer wheel).
# Normalisation and environment choices: see lib.sh. Needs no root. Takes about 8 minutes.
# Usage: tools/golden/capture-stp.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"

topo_halls() { # halls: $1 = off (default) | stp
  ns_add hall-a; ns_add hall-b; ns_add a; ns_add b
  # Cable order sets ifindex: on each hall eth1=2, eth2=3, eth3=4, then br0=5.
  cable hall-a eth1 02:00:00:00:0a:01 a eth0 02:00:00:00:00:0a
  cable hall-b eth1 02:00:00:00:0b:01 b eth0 02:00:00:00:00:0b
  cable hall-a eth2 02:00:00:00:0a:02 hall-b eth2 02:00:00:00:0b:02
  cable hall-a eth3 02:00:00:00:0a:03 hall-b eth3 02:00:00:00:0b:03
  local stp=0; [ "${1:-off}" = stp ] && stp=1
  for h in hall-a hall-b; do
    ip -n "$h" link add br0 type bridge vlan_default_pvid 0 stp_state $stp
    for p in eth1 eth2 eth3; do ip -n "$h" link set "$p" master br0; ip -n "$h" link set "$p" up; done
    ip -n "$h" link set br0 up
  done
  ip -n a link set eth0 up; ip -n b link set eth0 up
  ip -n a addr add 10.0.0.1/24 dev eth0; ip -n b addr add 10.0.0.2/24 dev eth0
  # Not br0: with STP on it has no carrier until a port forwards (~30 s).
  wait_up hall-a eth1 eth2 eth3; wait_up hall-b eth1 eth2 eth3; wait_up a eth0; wait_up b eth0
  TOPO=halls; [ $stp = 1 ] && TOPO=halls-stp
  TOPO_DESC="$TOPO: hall-a (lo=1 eth1=2 eth2=3 eth3=4 br0=5) br0 bridge (vlan_default_pvid 0, stp_state $stp) over eth1 02:00:00:00:0a:01, eth2 02:00:00:00:0a:02, eth3 02:00:00:00:0a:03; hall-b the same with 02:00:00:00:0b:01..03; hall-a eth1<->a eth0 02:00:00:00:00:0a 10.0.0.1/24, hall-b eth1<->b eth0 02:00:00:00:00:0b 10.0.0.2/24, span hall-a eth2<->hall-b eth2, span-2 hall-a eth3<->hall-b eth3; all up; IPv6 off"
}

step() { STEPS+=("$1: $2"); } # record a command a case already ran (it changed state)

start_family stp stp

# ── Commands, STP off (the loop is closed but quiet) ──────────────────────────────────────────
case_ link-show-off            halls hall-a 'bridge link show'
case_ link                     halls hall-a 'bridge link'
case_ link-l                   halls hall-a 'bridge l'
case_ link-list                halls hall-b 'bridge link list'
case_ link-show-dev            halls hall-a 'bridge link show dev eth2'
case_ link-show-missing-dev    halls hall-a 'bridge link show dev eth9'
case_ link-show-dev-br0        halls hall-a 'bridge link show dev br0'
case_ link-show-extra-word     halls hall-a 'bridge link show eth2'
case_ link-show-dev-incomplete halls hall-a 'bridge link show dev'
case_ link-unknown-cmd         halls hall-a 'bridge link frob'
case_ link-show-host           halls a      'bridge link show'
case_ link-show-port-down      halls hall-a 'bridge link show' 'hall-a|ip link set eth3 down'
case_ link-show-peer-down      halls hall-b 'bridge link show' 'hall-a|ip link set eth3 down'
case_ link-show-br-down        halls hall-a 'bridge link show' 'hall-a|ip link set br0 down'
case_ stp-on                   halls hall-a 'ip link set br0 type bridge stp_state 1'
case_ stp-on-dev               halls hall-a 'ip link set dev br0 type bridge stp_state 1'
case_ stp-on-show              halls hall-a 'bridge link show' 'hall-a|ip link set br0 type bridge stp_state 1'
case_ stp-on-twice             halls hall-a 'ip link set br0 type bridge stp_state 1' 'hall-a|ip link set br0 type bridge stp_state 1'
case_ stp-off                  halls hall-a 'ip link set br0 type bridge stp_state 0'
case_ stp-two                  halls hall-a 'ip link set br0 type bridge stp_state 2'
case_ stp-bad-value            halls hall-a 'ip link set br0 type bridge stp_state x'
case_ stp-incomplete           halls hall-a 'ip link set br0 type bridge stp_state'
case_ stp-not-bridge           halls hall-a 'ip link set eth1 type bridge stp_state 1'
case_ stp-missing-dev          halls hall-a 'ip link set br9 type bridge stp_state 1'
case_ stp-on-host              halls a      'ip link set eth0 type bridge stp_state 1'
case_ type-bridge-nothing      halls hall-a 'ip link set br0 type bridge'
case_ type-bridge-unknown      halls hall-a 'ip link set br0 type bridge frob 1'
case_ type-unknown             halls hall-a 'ip link set br0 type frob stp_state 1'
case_ type-unknown-bare        halls hall-a 'ip link set br0 type frob'
case_ type-incomplete          halls hall-a 'ip link set br0 type'
case_ type-bridge-and-up       halls hall-a 'ip link set br0 type bridge stp_state 1 up'
case_ bridge-priority          halls hall-a 'ip link set br0 type bridge priority 4096'
case_ bridge-priority-big      halls hall-a 'ip link set br0 type bridge priority 70000'
case_ bridge-priority-bad      halls hall-a 'ip link set br0 type bridge priority x'
case_ forward-delay-off        halls hall-a 'ip link set br0 type bridge forward_delay 100'
case_ forward-delay-on-short   halls hall-a 'ip link set br0 type bridge forward_delay 100' 'hall-a|ip link set br0 type bridge stp_state 1'
case_ forward-delay-on         halls hall-a 'ip link set br0 type bridge forward_delay 400' 'hall-a|ip link set br0 type bridge stp_state 1'
case_ hello-time-short         halls hall-a 'ip link set br0 type bridge hello_time 50'
case_ max-age-short            halls hall-a 'ip link set br0 type bridge max_age 100'
case_ ageing-time              halls hall-a 'ip link set br0 type bridge ageing_time 1000'
case_ link-set-cost            halls hall-a 'bridge link set dev eth3 cost 10'
case_ link-set-cost-show       halls hall-a 'bridge link show' 'hall-a|bridge link set dev eth3 cost 10'
case_ link-set-priority-show   halls hall-a 'bridge link show' 'hall-a|bridge link set dev eth3 priority 10'
case_ link-set-both-show       halls hall-a 'bridge link show dev eth3' 'hall-a|bridge link set dev eth3 cost 7 priority 5'
case_ link-set-priority-range  halls hall-a 'bridge link set dev eth3 priority 64'
case_ link-set-cost-range      halls hall-a 'bridge link set dev eth3 cost 70000'
case_ link-set-cost-zero       halls hall-a 'bridge link show dev eth3' 'hall-a|bridge link set dev eth3 cost 0'
case_ link-set-cost-word       halls hall-a 'bridge link show dev eth3' 'hall-a|bridge link set dev eth3 cost x'
case_ link-set-missing-dev     halls hall-a 'bridge link set dev eth9 cost 3'
case_ link-set-no-dev          halls hall-a 'bridge link set eth3 cost 3'
case_ link-set-nothing         halls hall-a 'bridge link set dev eth3'
case_ link-set-cost-incomplete halls hall-a 'bridge link set dev eth3 cost'
case_ link-set-not-port        halls a      'bridge link set dev eth0 cost 3'
case_ link-set-bridge          halls hall-a 'bridge link set dev br0 cost 3'

# ── STP from the start: listening, learning, forwarding; one port blocking ────────────────────
fresh halls stp
pause 5
run start-listening-a       hall-a 'bridge link show'
run start-listening-b       hall-b 'bridge link show'
run start-listening-br0     hall-a 'ip link show br0'
pause 17
run start-learning-a        hall-a 'bridge link show'
run start-learning-b        hall-b 'bridge link show'
pause 18
run start-forwarding-a      hall-a 'bridge link show'
run start-forwarding-b      hall-b 'bridge link show'
run start-forwarding-br0    hall-a 'ip link show br0'
run start-forwarding-fdb-b  hall-b 'bridge fdb show br br0'
# Failover: pull the active span at hall-a (both ends lose carrier).
on hall-a 'ip link set eth2 down'
pause 2
run failover-listening-a    hall-a 'bridge link show'
run failover-listening-b    hall-b 'bridge link show'
run failover-fdb-b          hall-b 'bridge fdb show br br0'
pause 20
run failover-learning-b     hall-b 'bridge link show'
pause 18
run failover-forwarding-b   hall-b 'bridge link show'
run failover-forwarding-a   hall-a 'bridge link show'

# ── Traffic: nothing passes while listening; it flows once forwarding; again after failover ───
fresh halls stp
pause 5
run ping-listening          a 'ping -c 1 -W 1 10.0.0.2'; step a 'ping -c 1 -W 1 10.0.0.2'
pause 35
run ping-forwarding         a 'ping -c 2 10.0.0.2'; step a 'ping -c 2 10.0.0.2'
run ping-forwarding-fdb-a   hall-a 'bridge fdb show br br0'
on hall-a 'ip link set eth2 down'
pause 2
run ping-failover-listening a 'ping -c 1 -W 1 10.0.0.2'; step a 'ping -c 1 -W 1 10.0.0.2'
pause 33
run ping-failover-forwarding a 'ping -c 1 10.0.0.2'

# ── STP turned on while the loop is closed: hall-a first, hall-b 3 s later ────────────────────
fresh halls
on hall-a 'ip link set br0 type bridge stp_state 1'
pause 3
on hall-b 'ip link set br0 type bridge stp_state 1'
pause 6
run later-a-blocks-a        hall-a 'bridge link show'
run later-a-blocks-b        hall-b 'bridge link show'
pause 21
run later-ages-out-a        hall-a 'bridge link show'
run later-ages-out-b        hall-b 'bridge link show'
pause 32
run later-settled-a         hall-a 'bridge link show'
run later-settled-b         hall-b 'bridge link show'
# …and off again: the blocked port stays blocked until its stored BPDU ages out (20 s).
on hall-a 'ip link set br0 type bridge stp_state 0'
on hall-b 'ip link set br0 type bridge stp_state 0'
run off-again-b             hall-b 'bridge link show'
pause 25
run off-again-aged-b        hall-b 'bridge link show'

# ── Election: a cheaper span on hall-b; a lower bridge priority makes hall-b the root ─────────
fresh halls stp
on hall-b 'bridge link set dev eth3 cost 1'
pause 40
run cost-b                  hall-b 'bridge link show'
run cost-a                  hall-a 'bridge link show'
fresh halls stp
on hall-b 'ip link set br0 type bridge priority 4096'
pause 40
run priority-a              hall-a 'bridge link show'
run priority-b              hall-b 'bridge link show'

# ── tcpdump: BPDUs (the root's hellos every 2 s; hall-b relays them to b) ─────────────────────
start_family tcpdump stp
fresh halls stp
pause 40
capture tcpdump-stp         hall-a 'tcpdump -n -c 2 -i eth2' 8
capture tcpdump-stp-e       b      'tcpdump -n -e -c 2 -i eth0' 8
capture tcpdump-stp-filter  hall-a 'tcpdump -n -c 1 -i eth1 stp' 6
capture tcpdump-stp-icmp    a      'tcpdump -n -c 2 -i eth0 icmp' 6 'a|ping -c 1 10.0.0.2'

# ── bytes: a config BPDU from the root, and one relayed by hall-b ─────────────────────────────
start_family bytes stp
fresh halls stp
pause 40
capture stp-config          hall-a 'tcpdump -n -e -xx -c 1 -i eth2' 6
capture stp-config-relay    b      'tcpdump -n -e -xx -c 1 -i eth0' 6

finish
INNER
