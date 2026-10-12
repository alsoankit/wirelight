#!/usr/bin/env bash
# Measures the Linux timers and defaults the simulator needs, on the same topologies as the
# goldens (lib.sh), and writes the raw measurements to tools/golden/facts-raw.txt.
# LINUX-FACTS.md is written by hand from that file. Needs no root. Usage: tools/golden/measure-facts.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" > "$here/facts-raw.txt" 2>&1 <<'INNER'
set -uo pipefail
source "$1/lib.sh"
ex() { ip netns exec "$@"; }
deltas() { awk '$1 ~ /^[0-9]+\.[0-9]+$/ { if (!t0) t0 = $1; printf "  +%.3fs  %s\n", $1 - t0, $0; next } NF { print "            " $0 }'; }
tdump() { # tdump <ns> <secs> <tcpdump args...>: timestamped capture (-tt) for <secs> seconds
  local ns="$1" secs="$2"; shift 2
  ex "$ns" timeout -s INT "$secs" stdbuf -oL tcpdump -Z root -tt -n -l "$@" 2>/dev/null > "$TMPD/cap" &
  sleep 0.7
}

echo "== Versions"; ip -V; ping -V | head -1; tcpdump --version 2>&1 | head -2; uname -r

echo; echo "== Defaults in a fresh namespace (after lib.sh's reset of host-inherited IPv4 conf)"
fresh lan
ex observatory sysctl net.ipv4.ip_forward net.ipv4.ip_default_ttl net.ipv4.icmp_ratelimit \
  net.ipv4.icmp_ratemask net.ipv4.icmp_msgs_per_sec net.ipv4.icmp_msgs_burst \
  net.ipv4.icmp_echo_ignore_broadcasts net.ipv4.conf.eth0.send_redirects net.ipv4.conf.eth0.accept_redirects \
  net.ipv4.conf.eth0.arp_ignore net.ipv4.conf.eth0.arp_announce net.ipv4.conf.eth0.arp_notify \
  net.ipv4.ip_local_port_range net.ipv4.ping_group_range
echo "-- neighbour parameters on eth0"
ex observatory sysctl -a 2>/dev/null | grep '^net.ipv4.neigh.eth0'

echo; echo "== Bridge defaults"
fresh switch
ex hall ip -d link show br0 | grep -o 'forward_delay [0-9]*\|ageing_time [0-9]*\|stp_state [0-9]*\|mcast_snooping [0-9]*\|vlan_filtering [0-9]*'
ex hall cat /sys/class/net/br0/bridge/ageing_time | sed 's/^/  sysfs ageing_time (centiseconds) = /'
echo "-- br0 MAC follows the lowest port MAC:"; ex hall ip link show br0 | grep link/ether

echo; echo "== Bridge: IGMP reports from br0 after it comes up (tcpdump on hall eth1 from creation)"
wipe; ns_add hall; ns_add a; cable hall eth1 02:00:00:00:00:11 a eth0 02:00:00:00:00:0a
ip -n hall link add br0 type bridge vlan_default_pvid 0; ip -n hall link set eth1 master br0
ip -n hall link set eth1 up; ip -n a link set eth0 up; wait_up hall eth1
tdump a 6 -i eth0; ip -n hall link set br0 up; wait; deltas < "$TMPD/cap"

echo; echo "== Unanswered ARP: retransmits and neighbour states (observatory pings 10.0.0.9 once)"
fresh lan
tdump observatory 6 -i eth0 arp
start=$(date +%s.%N)
ex observatory ping -c 1 -W 5 10.0.0.9 >/dev/null 2>&1 &
prev=""; for _ in $(seq 120); do
  s=$(ex observatory ip neigh show 10.0.0.9 | awk '{print $NF}')
  [ "$s" != "$prev" ] && { printf '  state at +%.2fs: %s\n' "$(echo "$(date +%s.%N) - $start" | bc)" "${s:-<none>}"; prev="$s"; }
  sleep 0.05
done
wait; echo "-- ARP requests on the wire:"; deltas < "$TMPD/cap"

echo; echo "== ping 10.0.0.9 -c 4: when the 'Destination Host Unreachable' lines appear"
fresh lan
ex observatory bash -c 'stdbuf -oL ping -c 4 10.0.0.9 | while IFS= read -r l; do printf "%s %s\n" "$(date +%s.%N)" "$l"; done' | deltas

echo; echo "== ping default interval and IP IDs (ping -c 5 10.0.0.7, captured on lantern)"
fresh lan
tdump lantern 7 -i eth0 -v icmp
ex observatory ping -c 5 10.0.0.7 >/dev/null; wait
deltas < "$TMPD/cap"

echo; echo "== ping -i 0.2 -c 5 IP IDs (to see whether the ID is a counter)"
fresh lan
tdump lantern 4 -i eth0 -v 'icmp[icmptype] = icmp-echo'
ex observatory ping -i 0.2 -c 5 10.0.0.7 >/dev/null; wait
deltas < "$TMPD/cap"

echo; echo "== Neighbour after a successful ping, seen from both sides, with timestamps of ARP traffic"
fresh lan
tdump lantern 9 -i eth0 arp
ex observatory ping -c 1 10.0.0.7 >/dev/null
s0=$(date +%s.%N)
for target in 0.2 4.8 5.6 7.0; do
  while [ "$(echo "$(date +%s.%N) - $s0 < $target" | bc)" = 1 ]; do sleep 0.05; done
  printf '  +%ss  observatory: %s | lantern: %s\n' "$target" "$(ex observatory ip neigh | tr -s ' ')" "$(ex lantern ip neigh | tr -s ' ')"
done
wait; echo "-- ARP on the wire:"; deltas < "$TMPD/cap"

echo; echo "== REACHABLE lifetime with base_reachable_time_ms=1000 (5 runs; expected 0.5-1.5 s)"
for i in 1 2 3 4 5; do
  fresh lan
  ex observatory sysctl -qw net.ipv4.neigh.eth0.base_reachable_time_ms=1000 net.ipv4.neigh.eth0.delay_first_probe_time=0
  ex observatory ping -c 1 10.0.0.7 >/dev/null; s0=$(date +%s.%N)
  while ex observatory ip neigh | grep -q REACHABLE; do sleep 0.02; done
  printf '  run %s: left REACHABLE after %.2fs -> %s\n' "$i" "$(echo "$(date +%s.%N) - $s0" | bc)" "$(ex observatory ip neigh | awk '{print $NF}')"
done

echo; echo "== Neighbour state timeline with base_reachable_time_ms=1000 and default delay_first_probe_time=5"
fresh lan
ex observatory sysctl -qw net.ipv4.neigh.eth0.base_reachable_time_ms=1000
tdump lantern 15 -i eth0 arp
s0=$(date +%s.%N); ex observatory ping -c 1 -W 1 10.0.0.7 >/dev/null
prev=""; for _ in $(seq 250); do
  st=$(ex observatory ip neigh show 10.0.0.7 | awk '{print $NF}')
  [ "$st" != "$prev" ] && { printf '  state at +%.2fs: %s\n' "$(echo "$(date +%s.%N) - $s0" | bc)" "$st"; prev="$st"; }
  sleep 0.03
done
wait; echo "-- ARP on the wire:"; deltas < "$TMPD/cap"

echo; echo "== ICMP rate limit: 20 pings with TTL 1 at 10 ms through bridgehead (count time-exceeded)"
fresh routed on
ex left ping -c 20 -i 0.01 -t 1 10.0.2.20 2>&1 | grep -c 'Time to live exceeded' | sed 's/^/  time exceeded received: /'
echo "-- and 20 pings to a missing network (net unreachable), twice"
ex left ping -c 20 -i 0.01 10.9.9.9 2>&1 | grep -c 'Net Unreachable' | sed 's/^/  net unreachable received: /'
sleep 6
ex left ping -c 20 -i 0.01 10.9.9.9 2>&1 | grep -c 'Net Unreachable' | sed 's/^/  net unreachable received: /'

echo; echo "== Router host unreachable: time from first echo to ICMP error (right has no address)"
fresh routed on; on right 'ip addr flush dev eth0'
tdump left 7 -i eth0 icmp
ex left ping -c 1 -W 6 10.0.2.20 >/dev/null; wait; deltas < "$TMPD/cap"

echo; echo "== Neighbour probe that goes unanswered: DELAY -> PROBE -> FAILED (lantern loses its address)"
fresh lan
ex observatory sysctl -qw net.ipv4.neigh.eth0.base_reachable_time_ms=1000 net.ipv4.neigh.eth0.delay_first_probe_time=0
ex observatory ping -c 1 10.0.0.7 >/dev/null; sleep 3
ex observatory sysctl -qw net.ipv4.neigh.eth0.base_reachable_time_ms=30000 net.ipv4.neigh.eth0.delay_first_probe_time=5
echo "  before: $(ex observatory ip neigh | tr -s ' ')"
ex lantern ip addr flush dev eth0
tdump observatory 11 -i eth0 arp
s0=$(date +%s.%N); ex observatory ping -c 1 -W 1 10.0.0.7 >/dev/null
prev=""; for _ in $(seq 200); do
  st=$(ex observatory ip neigh show 10.0.0.7 | awk '{print $NF}')
  [ "$st" != "$prev" ] && { printf '  state at +%.2fs: %s\n' "$(echo "$(date +%s.%N) - $s0" | bc)" "${st:-<none>}"; prev="$st"; }
  sleep 0.05
done
wait; echo "-- ARP on the wire (unicast probes, then nothing):"; deltas < "$TMPD/cap"


echo; echo "== Bridge ageing with ageing_time 200 (2 s): when does a's learned entry vanish?"
fresh switch ip; ex hall ip link set br0 type bridge ageing_time 200
ex a ping -c 1 10.0.0.2 >/dev/null; s0=$(date +%s.%N)
while ex hall bridge fdb show | grep -q '02:00:00:00:00:0a'; do sleep 0.05; done
printf '  gone after %.2fs\n' "$(echo "$(date +%s.%N) - $s0" | bc)"
finish
INNER
