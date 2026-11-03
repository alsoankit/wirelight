#!/usr/bin/env bash
# Captures real Linux output for `dhclient` (family dhcp), DHCP frames byte for byte (family bytes)
# and tcpdump's view of an exchange (family tcpdump).
#
# Topology "square" (Floor 7's square, made small): hall's br0 over eth1..eth3, cabled to
#   observatory eth0 02:00:00:00:00:05 (no address: the DHCP client),
#   registry    eth0 02:00:00:00:00:02 10.0.1.2/24 (the DHCP server: dnsmasq),
#   kitchen     eth0 02:00:00:00:00:07 10.0.1.7/24.
# The registry runs dnsmasq with a range 10.0.1.100-10.0.1.150, a 1 h lease and no DNS. Variants
# (the second word of the topology): ping (dnsmasq's default: it pings an address before offering
# it), noping (--no-ping), seq (--dhcp-sequential-ip), norouter (--dhcp-option=3: no router
# option), none (no server at all).
#
# The client is Fedora 44's ISC dhclient 4.4.3-P1 (dhcp-client 4.4.3-26.fc44) with Fedora's own
# dhclient-script, unpacked (not installed: no root) into $DHCP_ROOT:
#   mkdir -p rpm root && cd rpm && dnf download dhcp-client dhcp-common ipcalc && cd ../root
#   for f in ../rpm/*.rpm; do rpm2cpio "$f" | cpio -idm; done
# Inside the capture, `dhclient` on PATH is a wrapper that adds the paths a real install would
# have built in: -sf <script> -lf /run/dhcp/<machine>.leases -pf /run/dhcp/<machine>.pid. The
# script is Fedora's, unchanged except its PATH line, which also points at the unpacked ipcalc
# (tools/golden/LINUX-FACTS.md, "DHCP").
# dnsmasq is the host's (/usr/bin/dnsmasq), run in the registry's namespace with --no-daemon and
# `-u root` (it can't drop to `nobody` inside a user namespace).
#
# Normalisation (lib.sh): xid=0x… -> xid=<xid>, "interval N" -> "interval <n>", "renewal in N
# seconds" -> "renewal in <n> seconds", dhclient(PID) -> dhclient(<pid>): all random per run.
# Needs no root. Usage: DHCP_ROOT=/path/to/unpacked tools/golden/capture-dhcp.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
: "${DHCP_ROOT:?set DHCP_ROOT to the unpacked dhcp-client, dhcp-common and ipcalc RPMs (see the header)}"
export DHCP_ROOT
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"

# ── The client's environment ─────────────────────────────────────────────────────────────────
mkdir -p /run/dhcp/bin /run/systemd/resolve
# /etc/resolv.conf points into /run (systemd-resolved); with /run private, give it its target so
# dhclient-script's resolv.conf check stays quiet, as on a real machine.
touch /run/systemd/resolve/stub-resolv.conf
cp "$DHCP_ROOT/usr/bin/ipcalc" /run/dhcp/bin/
sed 's#^PATH=/bin:/usr/bin:/sbin#PATH=/run/dhcp/bin:/bin:/usr/bin:/sbin#' "$DHCP_ROOT/usr/bin/dhclient-script" > /run/dhcp/dhclient-script
chmod +x /run/dhcp/dhclient-script
cat > /run/dhcp/bin/dhclient <<EOF
#!/bin/bash
ns=\$(ip netns identify \$\$)
exec "$DHCP_ROOT/usr/bin/dhclient" -sf /run/dhcp/dhclient-script -lf "/run/dhcp/\$ns.leases" -pf "/run/dhcp/\$ns.pid" "\$@"
EOF
chmod +x /run/dhcp/bin/dhclient
export PATH="/run/dhcp/bin:$PATH"

stop_daemons() { # dhclient goes to the background once bound; dnsmasq runs until killed
  pkill -f "$DHCP_ROOT/usr/bin/dhclient" 2>/dev/null
  [ -f /run/dhcp/dnsmasq.pid ] && kill "$(cat /run/dhcp/dnsmasq.pid)" 2>/dev/null
  sleep 0.2
  rm -f /run/dhcp/*.leases /run/dhcp/*.pid /run/dhcp/dnsmasq.*
}

topo_square() { # square: $1 = ping (default) | noping | seq | norouter | none
  ns_add hall; ns_add observatory; ns_add registry; ns_add kitchen
  cable hall eth1 02:00:00:00:00:11 observatory eth0 02:00:00:00:00:05
  cable hall eth2 02:00:00:00:00:12 registry eth0 02:00:00:00:00:02
  cable hall eth3 02:00:00:00:00:13 kitchen eth0 02:00:00:00:00:07
  ip -n hall link add br0 type bridge vlan_default_pvid 0
  for p in eth1 eth2 eth3; do ip -n hall link set "$p" master br0; ip -n hall link set "$p" up; done
  ip -n hall link set br0 up
  for h in observatory registry kitchen; do ip -n "$h" link set eth0 up; done
  ip -n registry addr add 10.0.1.2/24 dev eth0
  ip -n kitchen addr add 10.0.1.7/24 dev eth0
  wait_up hall eth1 eth2 eth3 br0; for h in observatory registry kitchen; do wait_up "$h" eth0; done
  local v="${1:-ping}" flags="" what=""
  case "$v" in
    ping) what="dnsmasq (pings before offering)" ;;
    noping) flags="--no-ping"; what="dnsmasq --no-ping" ;;
    seq) flags="--dhcp-sequential-ip"; what="dnsmasq --dhcp-sequential-ip" ;;
    norouter) flags="--dhcp-option=3"; what="dnsmasq --dhcp-option=3 (no router option)" ;;
    none) what="no DHCP server" ;;
  esac
  if [ "$v" != none ]; then
    # shellcheck disable=SC2086
    ip netns exec registry dnsmasq --no-daemon -C /dev/null --port=0 -u root -i eth0 --bind-interfaces \
      --dhcp-range=10.0.1.100,10.0.1.150,1h --dhcp-leasefile=/run/dhcp/dnsmasq.leases \
      --pid-file=/run/dhcp/dnsmasq.pid $flags > /run/dhcp/dnsmasq.log 2>&1 &
  fi
  TOPO="square-$v"
  TOPO_DESC="$TOPO: hall (lo=1 eth1=2 eth2=3 eth3=4 br0=5) br0 bridge (vlan_default_pvid 0) over eth1 02:00:00:00:00:11, eth2 02:00:00:00:00:12, eth3 02:00:00:00:00:13; eth1<->observatory eth0 02:00:00:00:00:05 (no address), eth2<->registry eth0 02:00:00:00:00:02 10.0.1.2/24, eth3<->kitchen eth0 02:00:00:00:00:07 10.0.1.7/24; all up; registry: $what, dhcp-range 10.0.1.100-10.0.1.150, lease 1h, no DNS; IPv6 off"
  # As in the switch topology: let br0's two IGMP reports pass so captures start quiet.
  sleep 2.5
}

fresh() { stop_daemons; wipe; "topo_$1" "${@:2}"; sleep 0.1; STEPS=(); }

S='square ping'
BOUND='observatory|dhclient eth0'
TAKEN='kitchen|ip addr add 10.0.1.149/24 dev eth0'   # dnsmasq's first pick for 02:00:00:00:00:05

# ── dhclient ─────────────────────────────────────────────────────────────────────────────────
start_family dhcp dhcp
case_ dhclient-v              "$S" observatory 'dhclient -v eth0'
case_ dhclient-quiet          "$S" observatory 'dhclient eth0'
case_ dhclient-no-iface       "$S" observatory 'dhclient -v'
case_ dhclient-ip-addr        "$S" observatory 'ip addr show dev eth0' "$BOUND"
case_ dhclient-ip-addr-later  "$S" observatory 'ip addr show dev eth0' "$BOUND" 'wait:3'
case_ dhclient-ip-route       "$S" observatory 'ip route' "$BOUND"
case_ dhclient-ping           "$S" observatory 'ping -c 2 10.0.1.7' "$BOUND"
case_ dhclient-registry-neigh "$S" registry    'ip neigh' "$BOUND"
case_ dhclient-in-use         "$S" observatory 'dhclient -v eth0' "$TAKEN"
case_ dhclient-noping         'square noping' observatory 'dhclient -v eth0'
case_ dhclient-in-use-noping  'square noping' observatory 'dhclient -v eth0' "$TAKEN"
case_ dhclient-in-use-noping-addr 'square noping' observatory 'ip addr show dev eth0' "$TAKEN" "$BOUND"
case_ dhclient-sequential     'square seq' observatory 'dhclient -v eth0'
case_ dhclient-norouter       'square norouter' observatory 'dhclient -v eth0'
case_ dhclient-norouter-route 'square norouter' observatory 'ip route' "$BOUND"
fresh square none; interrupt dhclient-no-server       observatory 1.5 'dhclient -v eth0'
fresh square none; interrupt dhclient-no-server-quiet observatory 1.5 'dhclient eth0'
case_ dhclient-release        "$S" observatory 'dhclient -r eth0' "$BOUND"
case_ dhclient-release-v      "$S" observatory 'dhclient -r -v eth0' "$BOUND"
case_ dhclient-release-addr   "$S" observatory 'ip addr show dev eth0' "$BOUND" 'observatory|dhclient -r eth0'
case_ dhclient-release-route  "$S" observatory 'ip route' "$BOUND" 'observatory|dhclient -r eth0'
case_ dhclient-release-nothing "$S" observatory 'dhclient -r eth0'
case_ dhclient-release-nothing-v "$S" observatory 'dhclient -r -v eth0'
case_ dhclient-release-twice  "$S" observatory 'dhclient -r -v eth0' "$BOUND" 'observatory|dhclient -r eth0'
case_ dhclient-after-release  "$S" observatory 'dhclient -v eth0' "$BOUND" 'observatory|dhclient -r eth0'
case_ dhclient-already-running "$S" observatory 'dhclient -v eth0' "$BOUND"
case_ dhclient-already-running-quiet "$S" observatory 'dhclient eth0' "$BOUND"
case_ dhclient-missing-dev    "$S" observatory 'dhclient -v eth9'
case_ dhclient-missing-dev-quiet "$S" observatory 'dhclient eth9'
case_ dhclient-bad-option     "$S" observatory 'dhclient -Z'
case_ dhclient-door-down      "$S" observatory 'dhclient -v eth0' 'observatory|ip link set eth0 down'
case_ dhclient-door-down-addr "$S" observatory 'ip addr show dev eth0' 'observatory|ip link set eth0 down' "$BOUND"
case_ dhclient-release-door-down "$S" observatory 'dhclient -r -v eth0' "$BOUND" 'observatory|ip link set eth0 down'

# ── tcpdump's view of an exchange ────────────────────────────────────────────────────────────
T() { fresh $1; [ -n "${PRE:-}" ] && on "${PRE%%|*}" "${PRE#*|}"; capture "${@:2}"; PRE=""; }
PRE=""
start_family tcpdump dhcp
T "$S" tcpdump-dhcp           observatory 'tcpdump -n -c 4 -i eth0 udp' 12 "$BOUND"
T "$S" tcpdump-dhcp-e         kitchen 'tcpdump -n -e -c 2 -i eth0 udp' 12 "$BOUND"
T "$S" tcpdump-dhcp-names     observatory 'tcpdump -c 4 -i eth0 udp' 12 "$BOUND"

# ── bytes: every byte of the DHCP frames ─────────────────────────────────────────────────────
start_family bytes dhcp
X='tcpdump -n -e -xx'
T "$S" dhcp-exchange          observatory "$X -c 10 -i eth0" 12 "$BOUND"
T 'square noping' dhcp-decline observatory "$X -c 9 -i eth0" 20 "$TAKEN" "$BOUND"
PRE="$BOUND"
T "$S" dhcp-release           observatory "$X -c 3 -i eth0" 6 'observatory|dhclient -r eth0'

stop_daemons
finish
INNER
