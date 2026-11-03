# Shared helpers for the golden capture scripts (tools/golden/capture-*.sh). Sourced, never run.
#
# Each capture script re-executes itself inside an unprivileged user + mount + network namespace
# (`unshare -rmn`), mounts a private /run so `ip netns` works, then for every case:
#   1. deletes every namespace and builds the named topology from scratch (fresh state per case),
#   2. runs the case's state steps (recorded word for word in the manifest),
#   3. runs the command on one device and writes three things:
#        packages/shell/test/golden/raw/<family>/<case>.txt   exactly what Linux printed
#        packages/shell/test/golden/<family>/<case>.txt       the same after normalisation (below)
#        packages/shell/test/golden/raw/manifest/<family>.jsonl   one manifest line per case
#      then rebuilds packages/shell/test/golden/manifest.json from all families.
#
# File format (same as the original ip-link goldens):
#   # <topology and state, one line>
#   $ <the command as the player types it>
#   <combined stdout + stderr>
#   [exit N]
#
# Environment choices (true for every case):
#   - IPv6 is disabled in every namespace before any door exists (the game has no IPv6). Without
#     this, doors send router solicitations and MLD reports as soon as they come up, bridges learn
#     MACs early and `ip addr` prints inet6 fe80:: lines.
#   - IPv4 settings are set explicitly to the kernel's defaults (ip_forward/forwarding 0, rp_filter 0,
#     promote_secondaries 0, accept/send_redirects 1, icmp_ratelimit 1000, icmp_ratemask 6168,
#     icmp_echo_ignore_broadcasts 1, ip_default_ttl 64), not the capture host's: new namespaces copy the host's values otherwise.
#   - Bridges are created with `vlan_default_pvid 0` (rooms configure their switches this way, so
#     `bridge fdb show` doesn't list each entry twice with "vlan 1"). Everything else is default.
#   - tcpdump runs with `-Z root` added (inside a user namespace it can't drop to the `tcpdump`
#     user) and under `stdbuf -oL` so stdout and stderr interleave as on a terminal. The golden's
#     "$" line shows the command without these.
#   - `sysctl -a` runs with its stderr dropped: in a user namespace some kernel.* keys are
#     unreadable and print "permission denied" lines that real root never sees.
#   - Every command runs in its own UTS namespace with the hostname set to the device's name, so
#     name lookups of the machine's own addresses (nss-myhostname: tcpdump without -n) give the
#     device's name, as on a real machine, not the capture host's.
#   - Streaming commands without -c (Ctrl+C in the game) are stopped with SIGINT by `timeout`.
#
# Normalisation (SH-09), applied to output lines only, never to the "$" line:
#   - "<name>@ifN:" becomes "<name>:"            (veth peer index; a real NIC has none)
#   - " link-netns <ns>" / " link-netnsid N" removed (veth peer namespace notes)
#   - "qdisc noqueue" becomes "qdisc fq_codel" on eth* doors (a real NIC gets fq_codel; veth gets
#     noqueue). lo and br0 keep noqueue (that is what they really have); never-up doors keep noop.
#   - ping: "time=0.045 ms" -> "time=<time> ms"; "time 1043ms" -> "time <time>ms";
#     "rtt min/avg/max/mdev = a/b/c/d ms" -> "= <time>/<time>/<time>/<time> ms".
#   - tcpdump: a leading "HH:MM:SS.uuuuuu " timestamp -> "<time> "; ICMP echo "id 12345" -> "id <id>"
#     (ping picks a random identifier); a UDP source port "10.0.0.5.54165 >" -> "10.0.0.5.<port> >"
#     (the sender's ephemeral port is random).
#   - dhclient: "(xid=0x5bb4bb21)" -> "(xid=<xid>)", "interval 8 (xid" -> "interval <n> (xid", "renewal in
#     1517 seconds" -> "renewal in <n> seconds", "dhclient(323463) is already running" ->
#     "dhclient(<pid>) is already running" (transaction id, backoff, renewal time and pid are random).
#   - ifindex numbers are kept: each topology creates its doors in the order the room lists them,
#     so lo=1 and then the doors in topology order.
#   - Trailing spaces are kept (Linux really prints "REACHABLE " and "master br0 " with one).
# Byte dumps (bytes/*.txt) are never normalised; their header lists the bytes that vary per run.

GOLDEN="${GOLDEN:?}"
mount -t tmpfs none /run && mkdir -p /run/netns
TMPD=$(mktemp -d)
NSES=()

# ── Building blocks ──────────────────────────────────────────────────────────────────────────

ns_add() { # ns_add <name>: a fresh namespace with IPv6 off, kernel-default IPv4 settings, lo up
  ip netns add "$1"
  ip netns exec "$1" sysctl -qw net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1
  # A new namespace copies the host's IPv4 conf (net.core.devconf_inherit_init_net=0), and this host
  # has forwarding on (container tooling) plus systemd's rp_filter=2 and promote_secondaries=1.
  # Reset them to the kernel's own defaults before any door exists, so doors inherit those.
  ip netns exec "$1" sysctl -qw net.ipv4.ip_forward=0 \
    net.ipv4.conf.all.rp_filter=0 net.ipv4.conf.default.rp_filter=0 \
    net.ipv4.conf.all.promote_secondaries=0 net.ipv4.conf.default.promote_secondaries=0 \
    net.ipv4.conf.all.accept_redirects=1 net.ipv4.conf.default.accept_redirects=1 \
    net.ipv4.conf.all.forwarding=0 net.ipv4.conf.default.forwarding=0 \
    net.ipv4.conf.all.send_redirects=1 net.ipv4.icmp_echo_ignore_broadcasts=1 \
    net.ipv4.icmp_ratelimit=1000 net.ipv4.icmp_ratemask=6168 net.ipv4.ip_default_ttl=64
  ip -n "$1" link set lo up
  NSES+=("$1")
}

cable() { # cable <nsA> <ifA> <macA> <nsB> <ifB> <macB>: a veth pair standing in for a cable
  ip -n "$1" link add "$2" address "$3" type veth peer name "$5" netns "$4" address "$6"
}

wipe() { local n; for n in "${NSES[@]}"; do ip netns del "$n" 2>/dev/null; done; NSES=(); }

wait_up() { # wait_up <ns> <if>...: veth carrier settles asynchronously; wait for state UP
  local ns="$1" i; shift
  for i in "$@"; do
    for _ in $(seq 100); do ip -n "$ns" link show "$i" | grep -q 'state UP' && break; sleep 0.02; done
  done
}

# ── Topologies ───────────────────────────────────────────────────────────────────────────────
# TOPO_DESC is the first half of each golden's comment line: enough to rebuild it in the simulator.

topo_lan() { # lan: observatory — kitchen on one cable. $1 = addr (default) | bare (no IPv4 addresses)
  ns_add observatory; ns_add kitchen
  cable observatory eth0 02:00:00:00:00:05 kitchen eth0 02:00:00:00:00:07
  ip -n observatory link set eth0 up; ip -n kitchen link set eth0 up
  if [ "${1:-addr}" = addr ]; then
    ip -n observatory addr add 10.0.0.5/24 dev eth0; ip -n kitchen addr add 10.0.0.7/24 dev eth0
    TOPO=lan
    TOPO_DESC="lan: observatory eth0 02:00:00:00:00:05 10.0.0.5/24 <-> kitchen eth0 02:00:00:00:00:07 10.0.0.7/24; both doors up; IPv6 off"
  else
    TOPO=lan-bare
    TOPO_DESC="lan-bare: observatory eth0 02:00:00:00:00:05 <-> kitchen eth0 02:00:00:00:00:07; both doors up; no IPv4 addresses; IPv6 off"
  fi
  wait_up observatory eth0; wait_up kitchen eth0
}

topo_switch() { # switch: hall's br0 over eth1..eth3, each cabled to host a, b, c (eth0). $1 = bare | ip
  ns_add hall; ns_add a; ns_add b; ns_add c
  cable hall eth1 02:00:00:00:00:11 a eth0 02:00:00:00:00:0a
  cable hall eth2 02:00:00:00:00:12 b eth0 02:00:00:00:00:0b
  cable hall eth3 02:00:00:00:00:13 c eth0 02:00:00:00:00:0c
  ip -n hall link add br0 type bridge vlan_default_pvid 0
  for p in eth1 eth2 eth3; do ip -n hall link set "$p" master br0; ip -n hall link set "$p" up; done
  ip -n hall link set br0 up
  for h in a b c; do ip -n "$h" link set eth0 up; done
  TOPO_DESC="switch: hall (lo=1 eth1=2 eth2=3 eth3=4 br0=5) br0 bridge (vlan_default_pvid 0, takes MAC 02:00:00:00:00:11 from its lowest port) over eth1 02:00:00:00:00:11, eth2 02:00:00:00:00:12, eth3 02:00:00:00:00:13; eth1<->a eth0 02:00:00:00:00:0a, eth2<->b eth0 02:00:00:00:00:0b, eth3<->c eth0 02:00:00:00:00:0c; all up; IPv6 off"
  TOPO=switch
  if [ "${1:-bare}" = ip ]; then
    ip -n a addr add 10.0.0.1/24 dev eth0; ip -n b addr add 10.0.0.2/24 dev eth0; ip -n c addr add 10.0.0.3/24 dev eth0
    TOPO=switch-ip
    TOPO_DESC="${TOPO_DESC/switch:/switch-ip:}; a 10.0.0.1/24, b 10.0.0.2/24, c 10.0.0.3/24"
  fi
  wait_up hall eth1 eth2 eth3 br0; for h in a b c; do wait_up "$h" eth0; done
  # br0 (multicast snooping on, the default) joins 224.0.0.106 and sends two unsolicited IGMPv3
  # reports within ~2 s of coming up. Let them pass so captures start from a quiet network.
  sleep 2.5
}

topo_routed() { # routed: left — bridgehead — right. $1 = off (default) | on: ip_forward on bridgehead
  # $2 = gw (default: hosts have default routes) | nogw (hosts have only their connected route)
  ns_add left; ns_add bridgehead; ns_add right
  cable left eth0 02:00:00:00:00:21 bridgehead eth0 02:00:00:00:00:31
  cable bridgehead eth1 02:00:00:00:00:32 right eth0 02:00:00:00:00:41
  ip -n left link set eth0 up; ip -n right link set eth0 up
  ip -n bridgehead link set eth0 up; ip -n bridgehead link set eth1 up
  ip -n left addr add 10.0.1.10/24 dev eth0
  ip -n bridgehead addr add 10.0.1.1/24 dev eth0; ip -n bridgehead addr add 10.0.2.1/24 dev eth1
  ip -n right addr add 10.0.2.20/24 dev eth0
  wait_up left eth0; wait_up bridgehead eth0 eth1; wait_up right eth0
  local gw="${2:-gw}"
  [ "$gw" = gw ] && { ip -n left route add default via 10.0.1.1; ip -n right route add default via 10.0.2.1; }
  [ "${1:-off}" = on ] && ip netns exec bridgehead sysctl -qw net.ipv4.ip_forward=1
  TOPO="routed-fwd-${1:-off}"; [ "$gw" = nogw ] && TOPO="$TOPO-nogw"
  TOPO_DESC="$TOPO: left eth0 02:00:00:00:00:21 10.0.1.10/24 <-> bridgehead eth0 02:00:00:00:00:31 10.0.1.1/24; bridgehead eth1 02:00:00:00:00:32 10.0.2.1/24 <-> right eth0 02:00:00:00:00:41 10.0.2.20/24; all up; bridgehead ip_forward=$([ "${1:-off}" = on ] && echo 1 || echo 0); $([ "$gw" = gw ] && echo 'left default via 10.0.1.1, right default via 10.0.2.1' || echo 'no default routes'); IPv6 off"
}

fresh() { wipe; "topo_$1" "${@:2}"; sleep 0.1; STEPS=(); }

# ── State steps (recorded in the manifest and the comment line) ──────────────────────────────

on() { # on <device> <command...>: run a setup command on a device and record it
  STEPS+=("$1: ${*:2}")
  ip netns exec "$1" bash -c "${*:2}" >/dev/null 2>&1
  # Carrier and operstate changes reach the peer through linkwatch, asynchronously (up to ~1 s).
  case "${*:2}" in *"link set"*) sleep 1.2 ;; esac
}
pause() { STEPS+=("wait ${1}s${2:+ ($2)}"); sleep "$1"; }

# ── Capture ──────────────────────────────────────────────────────────────────────────────────

FAMILY=""; FRAG=""
start_family() { # start_family <family> <part>: forget this script's earlier cases in <family>
  # Several scripts may add to one family (ping lives in capture-ipv4 and capture-route), so each
  # keeps its own manifest fragment raw/manifest/<family>.<part>.jsonl and deletes only its files.
  FAMILY="$1"; FRAG="$GOLDEN/raw/manifest/$1.$2.jsonl"
  mkdir -p "$GOLDEN/$FAMILY" "$GOLDEN/raw/$FAMILY" "$GOLDEN/raw/manifest"
  if [ -f "$FRAG" ]; then
    jq -r '.file, .raw' "$FRAG" | while read -r f; do rm -f "$GOLDEN/$f"; done
  fi
  : > "$FRAG"
}

normalize() {
  sed -E \
    -e 's/^([0-9]+: [A-Za-z0-9_.-]+)@if[0-9]+:/\1:/' \
    -e 's/ link-netns(id)? [^ ]+//' \
    -e '/^[0-9]+: eth[0-9]+:/ s/qdisc noqueue/qdisc fq_codel/' \
    -e 's/time=[0-9.]+ ms/time=<time> ms/' \
    -e 's/, time [0-9]+ms/, time <time>ms/' \
    -e 's#= [0-9.]+/[0-9.]+/[0-9.]+/[0-9.]+ ms#= <time>/<time>/<time>/<time> ms#' \
    -e 's/^[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6} /<time> /' \
    -e 's/(ICMP echo (request|reply), id )[0-9]+/\1<id>/' \
    -e '/UDP, length/ s/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\.[0-9]+ > /\1.<port> > /' \
    -e 's/\(xid=0x[0-9a-f]+\)/(xid=<xid>)/' \
    -e 's/ interval [0-9]+ \(xid/ interval <n> (xid/' \
    -e 's/renewal in [0-9]+ seconds/renewal in <n> seconds/' \
    -e 's/^dhclient\([0-9]+\) is already running/dhclient(<pid>) is already running/'
}

real_cmd() { # what actually runs for a player command (see "Environment choices")
  local c="$1"
  c="${c/#tcpdump /stdbuf -oL tcpdump -Z root }"
  c="${c/#sysctl -a |/sysctl -a 2>/dev/null |}"
  printf '%s' "$c"
}

emit() { # emit <case> <device> <player-cmd> <actual-cmd> <rawfile> <exit>
  local name="$1" dev="$2" cmd="$3" act="$4" body="$5" code="$6" desc
  desc="# $TOPO_DESC | setup: $( [ ${#STEPS[@]} -eq 0 ] && echo none || (IFS=';'; echo "${STEPS[*]}" | sed 's/;/; /g') ) | runs on: $dev"
  { echo "$desc"; echo "\$ $act"; cat "$body"; echo "[exit $code]"; } > "$GOLDEN/raw/$FAMILY/$name.txt"
  { echo "$desc"; echo "\$ $cmd"; normalize < "$body"; echo "[exit $code]"; } > "$GOLDEN/$FAMILY/$name.txt"
  jq -cn --arg family "$FAMILY" --arg case "$name" --arg file "$FAMILY/$name.txt" \
    --arg raw "raw/$FAMILY/$name.txt" --arg topology "$TOPO" --arg topologyDesc "$TOPO_DESC" \
    --arg device "$dev" --arg command "$cmd" --arg actual "$act" --argjson exit "$code" \
    --args '{family:$family,case:$case,file:$file,raw:$raw,topology:$topology,topologyDesc:$topologyDesc,device:$device,setup:$ARGS.positional,command:$command,actualCommand:$actual,exit:$exit}' \
    "${STEPS[@]}" >> "$FRAG"
}

run() { # run <case> <device> <player-cmd>: run in the current state and save
  local name="$1" dev="$2" cmd="$3" act; act=$(real_cmd "$3")
  ip netns exec "$dev" unshare -u bash -c "hostname $dev; $act" > "$TMPD/out" 2>&1
  emit "$name" "$dev" "$cmd" "$act" "$TMPD/out" "$?"
}

case_() { # case_ <name> <topology-args> <device> <player-cmd> [state steps as "dev|cmd" ...]
  local name="$1" topo="$2" dev="$3" cmd="$4"; shift 4
  # shellcheck disable=SC2086
  fresh $topo
  local s; for s in "$@"; do
    case "$s" in wait:*) pause "${s#wait:}" ;; *) on "${s%%|*}" "${s#*|}" ;; esac
  done
  run "$name" "$dev" "$cmd"
}

interrupt() { # interrupt <case> <device> <seconds> <player-cmd>: Ctrl+C after <seconds>
  local name="$1" dev="$2" secs="$3" cmd="$4" act; act=$(real_cmd "$4")
  ip netns exec "$dev" unshare -u timeout --preserve-status -s INT "$secs" bash -c "hostname $dev; exec $act" > "$TMPD/out" 2>&1
  emit "$name" "$dev" "$cmd" "timeout -s INT $secs $act" "$TMPD/out" "$?"
}

capture() { # capture <case> <device> <player-cmd> <guard-secs> <traffic steps "dev|cmd"|"wait:S"...>
  # Starts a streaming command (tcpdump) in the background, waits until it is listening, runs the
  # traffic steps, then waits for it to finish (-c N) or sends SIGINT after <guard-secs> (Ctrl+C).
  local name="$1" dev="$2" cmd="$3" guard="$4" act; shift 4; act=$(real_cmd "$cmd")
  ip netns exec "$dev" unshare -u timeout --preserve-status -s INT "$guard" bash -c "hostname $dev; exec $act" > "$TMPD/out" 2>&1 &
  local pid=$!
  for _ in $(seq 100); do grep -q 'listening on' "$TMPD/out" 2>/dev/null && break; sleep 0.05; done
  sleep 0.2
  local s; for s in "$@"; do
    case "$s" in
      wait:*) pause "${s#wait:}" "during capture" ;;
      *) STEPS+=("during capture, ${s%%|*}: ${s#*|}"); ip netns exec "${s%%|*}" bash -c "${s#*|}" >/dev/null 2>&1 ;;
    esac
  done
  wait "$pid"; local code=$?
  emit "$name" "$dev" "$cmd" "timeout -s INT $guard $act" "$TMPD/out" "$code"
}

build_manifest() { # merge every family's lines into manifest.json, sorted by family then case
  cat "$GOLDEN"/raw/manifest/*.jsonl | jq -s '{generatedBy:"tools/golden/capture-*.sh", note:"one entry per golden file; setup steps run in order on a fresh topology (see tools/golden/lib.sh)", cases: (sort_by(.family, .case))}' > "$GOLDEN/manifest.json"
}

finish() { wipe; build_manifest; rm -rf "$TMPD"; }
