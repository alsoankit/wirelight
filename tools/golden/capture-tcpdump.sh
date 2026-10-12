#!/usr/bin/env bash
# Captures real Linux output for `tcpdump` (family tcpdump) and byte-exact frames (family bytes).
#
# tcpdump starts first, in the background; once it prints "listening on", the traffic steps run
# (recorded as "during capture" in the manifest); it then stops by itself (-c N) or gets SIGINT
# after a guard time (the game's Ctrl+C). Topologies "lan", "routed" and "switch-ip": see lib.sh.
#
# bytes/<case>.txt hold `tcpdump -n -e -xx -c N` hex dumps: every byte of each frame, from the
# Ethernet header on. They are NOT normalised beyond the summary line; these bytes vary per run:
#   IPv4 identification (bytes 18-19 of the frame) and header checksum (24-25) of ICMP errors and
#   of kernel-built replies; ICMP echo identifier (38-39) and checksum (36-37); the first 16 bytes of
#   the echo payload (42-57: ping's send time, struct timeval, little-endian seconds + microseconds).
# Normalisation and environment choices (IPv6 off, tcpdump -Z root, stdbuf): see lib.sh.
# Needs no root. Usage: tools/golden/capture-tcpdump.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"

P1='observatory|ping -c 1 10.0.0.7'
P2='observatory|ping -c 2 10.0.0.7'
UDP='observatory|echo hello > /dev/udp/10.0.0.7/9'   # port 9 is closed: lantern answers ICMP port unreachable
T() { fresh $1; [ -n "${PRE:-}" ] && on "${PRE%%|*}" "${PRE#*|}"; capture "${@:2}"; PRE=""; }

start_family tcpdump tcpdump
PRE=""
# One segment, watched from lantern
T lan tcpdump-icmp            lantern 'tcpdump -n -i eth0 icmp' 4 "$P2"
T lan tcpdump-c               lantern 'tcpdump -n -c 4 -i eth0 icmp' 6 "$P2"
T lan tcpdump-no-n            lantern 'tcpdump -c 4 -i eth0' 6 "$P1"
T lan tcpdump-all             lantern 'tcpdump -n -i eth0' 4 "$P1"
T lan tcpdump-e               lantern 'tcpdump -n -e -c 4 -i eth0' 6 "$P1"
T lan tcpdump-arp             lantern 'tcpdump -n -c 2 -i eth0 arp' 6 "$P1"
T lan tcpdump-arp-e           lantern 'tcpdump -n -e -c 2 -i eth0 arp' 6 "$P1"
T lan tcpdump-arp-probe       lantern 'tcpdump -n -c 4 -i eth0 arp' 12 "$P1"
T lan tcpdump-udp             lantern 'tcpdump -n -c 1 -i eth0 udp' 6 "$UDP"
T lan tcpdump-udp-e           lantern 'tcpdump -n -e -c 1 -i eth0 udp' 6 "$UDP"
T lan tcpdump-port-unreachable lantern 'tcpdump -n -c 1 -i eth0 icmp' 6 "$UDP"
T lan tcpdump-host            lantern 'tcpdump -n -c 4 -i eth0 host 10.0.0.5' 6 "$P1"
T lan tcpdump-host-nobody     lantern 'tcpdump -n -i eth0 host 10.0.0.9' 5 'observatory|ping -c 1 -W 1 10.0.0.9'
T lan tcpdump-no-i            lantern 'tcpdump -n -c 2 icmp' 6 "$P1"
T lan tcpdump-sender          observatory 'tcpdump -n -c 4 -i eth0' 6 "$P1"
T lan tcpdump-nothing         lantern 'tcpdump -n -i eth0 icmp' 2
T lan tcpdump-flags-together  lantern 'tcpdump -ne -c 2 -i eth0 icmp' 6 "$P1"
# Through the router
T 'routed on' tcpdump-forwarded   bridgehead 'tcpdump -n -c 2 -i eth1 icmp' 6 'left|ping -c 1 10.0.2.20'
T 'routed on' tcpdump-ttl-exceeded left 'tcpdump -n -c 2 -i eth0 icmp' 6 'left|ping -c 1 -t 1 10.0.2.20'
T 'routed on' tcpdump-net-unreachable left 'tcpdump -n -c 2 -i eth0 icmp' 6 'left|ping -c 1 10.9.9.9'
PRE='right|ip addr flush dev eth0'
T 'routed on' tcpdump-host-unreachable left 'tcpdump -n -c 2 -i eth0 icmp' 10 'left|ping -c 1 -W 5 10.0.2.20'
T 'routed off' tcpdump-fwd-off-in  bridgehead 'tcpdump -n -i eth0 icmp' 4 'left|ping -c 2 -W 1 10.0.2.20'
T 'routed off' tcpdump-fwd-off-out bridgehead 'tcpdump -n -i eth1' 4 'left|ping -c 2 -W 1 10.0.2.20'
# A switch: c's port sees the flooded ARP broadcast, but not the unicast echo between a and b
T 'switch ip' tcpdump-switch-other-port hall 'tcpdump -n -e -i eth3' 4 'a|ping -c 1 10.0.0.2'
T 'switch ip' tcpdump-switch-br0  hall 'tcpdump -n -e -i br0' 4 'a|ping -c 1 10.0.0.2'
T 'switch ip' tcpdump-switch-port hall 'tcpdump -n -e -c 4 -i eth1' 6 'a|ping -c 1 10.0.0.2'
# Errors (run like any command; guard in case one doesn't exit)
fresh lan; interrupt tcpdump-missing-dev lantern 3 'tcpdump -i eth9'
fresh lan; interrupt tcpdump-bad-filter lantern 3 'tcpdump -i eth0 frobnicate'
fresh lan; interrupt tcpdump-bad-filter-host lantern 3 'tcpdump -i eth0 host'
fresh lan; interrupt tcpdump-c-garbage lantern 3 'tcpdump -c x -i eth0'
fresh lan; on lantern 'ip link set eth0 down'; interrupt tcpdump-door-down lantern 3 'tcpdump -n -i eth0'
fresh lan; interrupt tcpdump-bad-option lantern 3 'tcpdump -k'

# ── bytes: every byte of the frames the simulator must build ──────────────────────────────────
start_family bytes tcpdump
X='tcpdump -n -e -xx'
T lan arp-request-reply       lantern "$X -c 2 -i eth0 arp" 6 "$P1"
T lan arp-unicast-probe       lantern "$X -c 4 -i eth0 arp" 12 "$P1"
T lan icmp-echo               lantern "$X -c 4 -i eth0 icmp" 6 "$P2"
T lan icmp-echo-ttl5          lantern "$X -c 2 -i eth0 icmp" 6 'observatory|ping -c 1 -t 5 10.0.0.7'
T lan udp-port-unreachable    lantern "$X -c 2 -i eth0 udp or icmp" 6 "$UDP"
T 'routed on' icmp-time-exceeded left "$X -c 2 -i eth0 icmp" 6 'left|ping -c 1 -t 1 10.0.2.20'
T 'routed on' icmp-forwarded  bridgehead "$X -c 2 -i eth1 icmp" 6 'left|ping -c 1 10.0.2.20'
T 'routed on' icmp-net-unreachable left "$X -c 2 -i eth0 icmp" 6 'left|ping -c 1 10.9.9.9'
PRE='right|ip addr flush dev eth0'
T 'routed on' icmp-host-unreachable left "$X -c 2 -i eth0 icmp" 10 'left|ping -c 1 -W 5 10.0.2.20'
PRE='right|ip addr flush dev eth0'
T 'routed on' arp-unanswered  bridgehead "$X -i eth1 arp" 5 'left|ping -c 1 -W 4 10.0.2.20'

finish
INNER
