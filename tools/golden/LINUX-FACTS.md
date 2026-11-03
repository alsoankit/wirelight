# Linux facts for the simulator

Measured on this machine (versions in `VERSIONS.md`) by `tools/golden/measure-facts.sh`, whose raw
log is `facts-raw.txt`, and by the golden captures. "Measured" means seen on the wire or in
`ip neigh`, not read from documentation. Re-run the script after a kernel or tool upgrade.

## Capture environment (applies to every golden)
- **Captured with IPv6 disabled; the game has no IPv6.** Every namespace gets
  `net.ipv6.conf.{all,default}.disable_ipv6=1` before any door exists. With IPv6 on, doors send
  router solicitations and MLD reports as soon as they come up, bridges learn MACs early, and
  `ip addr` prints `inet6 fe80::` lines.
- **New namespaces copy the host's IPv4 settings.** `net.core.devconf_inherit_init_net=0` (the
  default) means a new namespace copies init_net's `conf.all`/`conf.default`. This host has
  `ip_forward=1` (container tooling) and systemd's `rp_filter=2` and `promote_secondaries=1`, so
  without a reset every "forwarding off" router really forwarded. `lib.sh` therefore sets the
  kernel defaults explicitly in every namespace: `ip_forward=0`, `conf.{all,default}.forwarding=0`,
  `rp_filter=0`, `promote_secondaries=0`, `accept_redirects=1`, `send_redirects=1`,
  `icmp_echo_ignore_broadcasts=1`, `icmp_ratelimit=1000`, `icmp_ratemask=6168`,
  `ip_default_ttl=64`. Forwarding is turned on only where a case wants it. (A real distro install
  would have `rp_filter=2` and `promote_secondaries=1` from systemd's `50-default.conf`; none of the
  current cases depends on them.)
- Bridges are created with `vlan_default_pvid 0`; everything else about them is default.

## Defaults (fresh namespace)
| Setting | Value |
|---|---|
| `net.ipv4.ip_forward` | 0 (kernel default; see above for why it must be set) |
| `net.ipv4.ip_default_ttl` | 64: ping's TTL, and the TTL of echo replies and ICMP errors |
| `net.ipv4.icmp_ratelimit` | 1000 (ms between tokens) |
| `net.ipv4.icmp_ratemask` | 6168 = bits 3, 4, 11, 12: dest unreachable, source quench, time exceeded, parameter problem |
| `net.ipv4.icmp_msgs_per_sec` / `icmp_msgs_burst` | 10000 / 10000 (global limit) |
| `net.ipv4.icmp_echo_ignore_broadcasts` | 1 |
| `conf.*.send_redirects` / `accept_redirects` | 1 / 1 |
| `conf.*.arp_ignore` / `arp_announce` / `arp_notify` | 0 / 0 / 0 (no gratuitous ARP on link up) |
| `net.ipv4.ip_local_port_range` | 32768–60999 (UDP source ports) |

### Neighbour (ARP) parameters, per door (`net.ipv4.neigh.eth0.*`)
| Key | Value | Meaning for the simulator |
|---|---|---|
| `base_reachable_time_ms` | 30000 | REACHABLE lasts a random time in [0.5, 1.5] × base = 15–45 s |
| `delay_first_probe_time` | 5 (s) | time in DELAY before the first unicast probe |
| `retrans_time_ms` | 1000 | gap between ARP requests/probes |
| `mcast_solicit` | 3 | broadcast requests for an unknown neighbour |
| `ucast_solicit` | 3 | unicast probes in PROBE |
| `app_solicit` / `mcast_resolicit` | 0 / 0 | |
| `gc_stale_time` | 60 (s) | |
| `unres_qlen` | 101 packets (`unres_qlen_bytes` 212992) | queue while INCOMPLETE |
| `locktime` | 100 (centiseconds) | |
| `interval_probe_time_ms` | 5000 | |

Changing `base_reachable_time_ms` re-rolls the random reachable time for the door at once, but an
entry that is already REACHABLE keeps the timer it had.

### Bridge
- `ageing_time` 30000 centiseconds = **300 s**; `forward_delay` 1500; `stp_state` 0 (no STP);
  `vlan_filtering` 0; `mcast_snooping` 1.
- With `ageing_time 200` (2 s), a learned entry disappeared after **2.05–2.07 s**.
- **br0 takes the MAC of its lowest-numbered port MAC** (02:00:00:00:00:11 here) unless one is set.
- A fresh bridge's `bridge fdb show` holds only Linux's own entries: each port's MAC
  (`master br0 permanent`) and multicast `self permanent` lines (33:33:00:00:00:01 and
  01:00:5e:00:00:01 on every port; on br0 also 01:00:5e:00:00:6a and 33:33:00:00:00:6a). Those
  multicast lines stay even with IPv6 off.
- Learned entries print with a **trailing space**: `02:00:00:00:00:0a dev eth1 master br0 `.
- **Static entry on the wrong port:** a non-sticky `static` entry **moves** to the port where the
  MAC is next learned, and stays `static` (`fdb-static-moves`). A `static sticky` entry **stays
  put** (`fdb-sticky-stays`), and traffic to that MAC then goes to the wrong port, so a ping from
  the host fails completely (`fdb-sticky-ping`).
- `bridge fdb del` of a missing entry, of an entry on another port, or without `master`:
  `RTNETLINK answers: No such file or directory` (exit 255).
- **IGMP noise:** when br0 comes up (multicast snooping on) it joins 224.0.0.106 and sends **two
  IGMPv3 reports** from 0.0.0.0 to 224.0.0.22, the second 0.5–1 s after the first (random). They
  come from br0's own MAC so the fdb doesn't learn anything. The switch topology waits 2.5 s after
  bringing br0 up so captures start quiet. The simulator can skip them.

## ARP and the neighbour table (measured)
- **Unanswered neighbour:** 3 broadcast requests at +0, +1.0, +2.03 s; INCOMPLETE from the first;
  **FAILED at ~3.1 s** (mcast_solicit × retrans_time). Nothing else follows.
- **A successful ping on one segment** (observatory → kitchen, both fresh):
  - observatory: request (broadcast), reply → entry **REACHABLE** at once.
  - kitchen: the request creates its entry for observatory (STALE); sending the echo reply makes
    it **DELAY**; after 5.0–5.3 s kitchen sends a **unicast** ARP probe to observatory, gets the
    reply, and the entry becomes **REACHABLE**.
- **REACHABLE → ?** When REACHABLE times out, the entry goes to **DELAY if it was used in the last
  `delay_first_probe_time` (5 s)**, otherwise **STALE**. With `base_reachable_time_ms=1000`
  REACHABLE lasted 0.6–1.5 s (5 runs).
  - Observed oddity: with base 1000 and the default 5 s delay, the entry never reaches STALE. It
    cycles REACHABLE (0.6 s) → DELAY (5 s) → unicast probe → REACHABLE → DELAY … about every
    6 s. The ARP exchanges themselves seem to count as "use". With `delay_first_probe_time=0` it
    goes REACHABLE → STALE in 0.5–1.5 s, which is how the goldens reach STALE. With the default
    30 s timer this doesn't arise (REACHABLE outlasts the 5 s window).
- **STALE + a packet → DELAY** at once. After 5 s → **PROBE**: 3 unicast requests 1.0 s apart; if
  answered → REACHABLE; if not → **FAILED** ~3 s after PROBE starts (measured: DELAY at 0, PROBE at
  5.26 s, FAILED at 8.31 s).
- A FAILED entry prints with no lladdr: `10.0.0.9 dev eth0 FAILED `. All `ip neigh` lines end
  with a trailing space.
- `ip neigh flush dev eth0` removes FAILED and REACHABLE entries but not PERMANENT ones.
- `ip neigh del` removes the entry completely (it doesn't linger as FAILED).

## ping (iputils 20250605)
- Default interval 1 s nominal; measured **1.024–1.031 s** between sends (ping's own timer
  overhead). The simulator should use 1000 ms.
- Packet: IPv4 total length 84, **DF set**, TOS 0, TTL 64 (or `-t`). ICMP id is **random** per run
  (raw socket); seq starts at 1.
- Payload (56 bytes): bytes 0–7 = send time seconds (little-endian 64-bit), 8–15 = microseconds
  (little-endian 64-bit), then 0x10, 0x11, … 0x37.
- **IP ID of requests:** non-zero, increasing by small irregular amounts (11760, 11824, 11834,
  11969, 12026 at 0.2 s): the kernel's hashed per-destination counter with random increments, not
  +1. **Echo replies** (kernel-built): DF clear, ID also from a counter (non-zero, irregular).
- Summary text (exact):
  - `PING 10.0.0.7 (10.0.0.7) 56(84) bytes of data.`
  - `64 bytes from 10.0.0.7: icmp_seq=1 ttl=64 time=0.045 ms`
  - blank line, `--- 10.0.0.7 ping statistics ---`
  - `4 packets transmitted, 4 received, 0% packet loss, time 3060ms`
  - `rtt min/avg/max/mdev = 0.031/0.040/0.045/0.006 ms`
  - With **no replies**: no rtt line; an **extra empty line** follows the statistics line. With
    errors: `…, 0 received, +4 errors, 100% packet loss, time 3090ms` then `pipe N` (or the empty line).
  - Errors: `From 10.0.0.5 icmp_seq=1 Destination Host Unreachable` (local ARP failed),
    `From 10.0.1.1 icmp_seq=1 Destination Net Unreachable`, `… Time to live exceeded`.
  - `ping: connect: Network is unreachable` (exit 2) when there's no route, the door is down, or the
    machine has no address.
  - Exit codes: 0 if any reply, 1 if none, 2 for usage/route errors.
- **Local ARP failure timing** (`ping -c 4` to a missing neighbour): seq 1–3 errors all print at
  ~3.1 s (when the ARP entry fails); seq 4 (sent at ~3 s) fails at ~6.2 s. ping keeps waiting for
  that last one, so it runs ~6.2 s but reports `time 3090ms`. The `pipe N` value (3 or 4) depends
  on timing. Through a router (`ping-host-unreachable-router`) the router's 3 queued packets fail
  together at ~3.1 s and it sends 3 host-unreachable errors at once; seq 4's error comes at ~6.2 s;
  ping prints `+4 errors`.
- `ping -i x` / `-W x` print `ping: option argument contains garbage: x` plus
  `ping: this will become fatal error in the future` and then **run anyway**.
- A numeric address that isn't valid (`10.0.0.300`) is treated as a host name:
  `ping: 10.0.0.300: Temporary failure in name resolution` (this text depends on the resolver setup).

## Routing and ICMP errors (measured)
- Forwarded packets: TTL −1 (ping shows `ttl=63` from one router away).
- **Forwarding off:** the router drops packets for other networks **silently** (no ICMP), both for
  known networks and for networks it has no route to. It still answers pings to **any of its own
  addresses**, including the far-side one (`ping-router-far-side`).
- **TTL expiry** (`ping -t 1` through the router): `ICMP time exceeded in-transit` from the router's
  address on the arrival side. A ping with `-t 1` **to the router itself** succeeds (`ttl=64`).
- **Net unreachable:** forwarding on and no route → `ICMP net 10.9.9.9 unreachable`.
- **Host unreachable:** the router's ARP for the next hop fails after ~3.06 s, then it sends
  `ICMP host 10.0.2.20 unreachable` for each queued packet.
- **Missing return route** (right has no default route): left's pings vanish silently.
- **Wrong gateway on the same subnet** (`via 10.0.1.2`, nobody there): the host's own ARP fails
  → `From 10.0.1.10 … Destination Host Unreachable`.
- ICMP error bytes (see `packages/shell/test/golden/bytes/`): TOS **0xc0**, DF clear, TTL 64, ID from
  a counter; the payload quotes the **whole** original IP packet (total length 112 for a quoted
  84-byte ping; 62 for a quoted 34-byte UDP). In *time exceeded* the quoted header shows the TTL
  **as received** (1); in *host unreachable* it shows the TTL **already decremented** (63) with its
  checksum recomputed.
- **Port unreachable:** a UDP datagram to a closed port → `ICMP 10.0.0.7 udp port discard unreachable`.
- **Rate limits** (20 packets 10 ms apart): **6** time-exceeded errors came back (burst of 6, then 1
  per `icmp_ratelimit` 1000 ms); for net unreachable only **2** came back (twice, 6 s apart):
  net/host unreachable for forwarded packets go through the route-error limiter (`ip_error`),
  which is stricter than `icmp_ratelimit`.

## Redirects and routing loops (measured, `capture-redirect.sh`, topology "cathedral")
- **When a router sends a redirect:** only when it forwards a packet back out of the door it came
  in on **and the sender is directly on that door's street** (its route back is a gateway-less
  route out of that door). With `shared_media` 1 (default) the gateway needn't be checked. So in
  9.4's loop (observatory on the nave pinging 10.0.4.7) **neither router redirects**: crossing
  gets the packet on eth1 but the sender is on eth0; arch's sender isn't on the cloister at all.
  `ping -c 3 10.0.4.7` from the observatory prints `From 10.0.2.2 icmp_seq=N Time to live
  exceeded` three times (TTL 64: crossing sees even TTLs, arch odd, arch gets TTL 1).
  `-t 1` dies at crossing (`From 10.0.1.1`), `-t 2` at arch (`From 10.0.2.2`).
- From a house **on the cloister** (gallery, default via crossing) to the bell tower: crossing
  redirects it: `From 10.0.2.1: icmp_seq=1 Redirect Host(New nexthop: 10.0.2.2)` (note the colon
  after the address). Redirects are **not** counted as errors in ping's statistics.
- **Redirect bytes:** ICMP type 5 code 1 (host), gateway in bytes 4–7, TOS 0xc0, TTL 64, DF clear,
  the whole forwarded packet quoted **with its TTL already decremented** (the redirect is sent
  after the decrement); sent before the packet is forwarded on. tcpdump:
  `IP 10.0.2.1 > 10.0.2.7: ICMP redirect 10.0.3.2 to host 10.0.2.2, length 92`.
- **Rate limit** (ip_rt_send_redirect, per destination peer): the first goes at once; the next only
  after 20 ms << (redirects sent) (40, 80, 160, 320, 640, 1280 ms…); at most 9, then none until 20.48 s
  of quiet (each refused packet restarts the quiet). Because a redirect resets the peer's
  `rate_last`, and after quiet also its tokens, it **starves the same peer's ICMP errors**: in the
  loop seen from gallery (`ping -c 30 -i 0.2`), time exceeded came back only for seq 11, 15, 20, 27,
  redirects for 1–4 (both routers), then 6, 8, 12, 16, 23, 30. The simulator reproduces this case
  exactly (`ping-redirect-loop-fast`).
- **Accepting a redirect** (a host, accept_redirects 1): only if the route to that destination
  currently goes through the router that sent it; the new gateway must be an ordinary address. If its
  MAC isn't known yet the host only ARPs for it (no exception yet); once known, a **route exception**
  is kept for 300 s: `ip route get 10.0.3.2` → `10.0.3.2 via 10.0.2.2 dev eth0 src 10.0.2.7 uid 0`
  / `    cache <redirected> expires 299sec `. So `ping -c 3` to the bell tower from gallery shows
  redirects for seq 1 and 2 and goes direct to arch from seq 3. In the loop, the two routers'
  redirects flip gallery's exception back and forth between .1 and .2.
- `ip route show cache` lists an exception (`10.0.3.2 via 10.0.2.2 dev eth0 ` /
  `    cache <redirected> expires 298sec `) **only after a packet has gone out through it**; it is
  listed once per route sharing that gateway (twice after `ip route add 10.9.0.0/16 via 10.0.2.1`).
  Gone after `ip route flush cache` or the door going down; **not** cleared by adding other routes.
- **Routers don't accept redirects:** setting `ip_forward=1` (or `conf.all.forwarding=1`) sets
  `conf.all.accept_redirects` to 0 (back to 1 when forwarding goes off), and a forwarding machine
  needs both `all` and the door's flag. A host with both 0 still prints the redirects (raw socket)
  but keeps using its gateway, so it gets one per ping (`ping-redirect-refused`).
  `send_redirects` 0 on both `all` and the door: no redirects.
- **ping reads errors first:** when a redirect and a time exceeded for the same echo arrive 0.15 ms
  apart (`ping -c 1 -t 2` from gallery), ping prints only the error (5 of 5 runs): the socket error is
  returned before queued data, and the count is then complete.

## Duplicate addresses (measured, topology "switch-ip" with c given b's address 10.0.0.2)
- Both answer a's ARP request. **The first reply wins**; the second, 13 µs later, is ignored
  (`locktime` 1 s: a reply or an overheard request changes a known entry's MAC only if the entry
  is older than 1 s). The bridge floods **newest port first** (eth3 before eth2), so c answers first,
  every time (3 of 3). Ping just works, through c; no `(DUP!)` (that's only for broadcast pings).
- The loser keeps a STALE entry for a (from the request); the winner's goes DELAY (used for the reply).
- **Flips:** when the other one ARPs for a (`b: ip neigh flush; ping 10.0.0.1`), a's entry takes
  b's MAC at once (a request for one of our addresses always overrides) and ends DELAY; a's next pings
  go to b. Overhearing b ask for someone else (who-has 10.0.0.9 tell 10.0.0.2) also flips it (STALE),
  once the entry is older than 1 s.
- **The winner gives the address up** (`ip addr del`): a keeps sending to its MAC (pings lost
  silently) until the entry fails: REACHABLE (15–45 s, as armed) → DELAY 5 s → 3 unicast probes →
  FAILED; the next packet asks again and the other one answers. Changing a's neighbour timers after
  the entry is REACHABLE doesn't shorten it.
- **A permanent entry for a door that isn't there** (`ip neigh add … lladdr 02:00:00:00:00:99 nud
  permanent`): pings vanish (no errors, `100% packet loss`), the entry stays PERMANENT; after
  `ip neigh del` the next ping ARPs and works.

## Switching loop (measured qualitatively, 1 s only; with STP see "Spanning tree")
- Two bridges joined by two veth cables, STP off: one ARP request from a host circled at about
  **1 M frames/s per link**; each host received ~1,500–2,000 copies a second; the hosts' MACs jumped
  between the bridges' ports (a's own MAC learned on the loop ports of its own switch); a unicast
  ping during the storm was lost. Setting one loop port down stopped it within 0.3 s (counters
  frozen); learned entries settle on the right ports with the next traffic, and pings work again.
  Not captured as goldens (rates depend on the CPU); see `packages/sim/test/storm.test.ts` and
  `docs/sim-deviations.md`.

## Spanning tree (kernel STP, 802.1D; measured 2026-10-13, `capture-stp.sh`, goldens in `stp/`, `tcpdump/tcpdump-stp*`, `bytes/stp-*`)
Topology "halls": hall-a and hall-b, each `br0` over eth1..eth3, joined twice (eth2—eth2, eth3—eth3),
host a on hall-a eth1, host b on hall-b eth1. Kernel STP works in an unprivileged namespace (no
userspace `bridge-stp` helper is tried outside init_net).
- **Defaults:** `stp_state 0`; bridge priority 32768 (`8000`); `forward_delay` 1500, `hello_time`
  200, `max_age` 2000 centiseconds; port priority 32, port path cost **2** (veth reports 10 Gbit/s;
  a 1 Gbit NIC would get 4). Port ids are `priority << 10 | port number` (0x8001, 0x8002…), port
  numbers 1, 2, 3 in the order ports were added. Bridge id = priority + br0's MAC (its lowest port MAC).
- **`bridge link show`**: one line per bridge port, ifindex order, trailing space:
  `3: eth2: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master br0 state forwarding priority 32 cost 2 `.
  States: `disabled` (no carrier, port down, or br0 down), `blocking`, `listening`, `learning`,
  `forwarding`. With STP off every port with carrier is `forwarding`. Nothing for br0 itself or on a
  machine without bridges (exit 0). `bridge l`, `bridge link`, `bridge link list` are the same; a
  stray word (`bridge link show eth2`) is ignored; `dev eth9` → `Cannot find device "eth9"` (255).
- **Root election**: hall-a (8000.02:00:00:00:0a:01) is root; hall-b's root port is eth2 (equal
  cost 2, hall-a's port 8002 beats 8003) and **hall-b eth3 blocks**. hall-a's ports are all designated.
- **Timeline from creation with `stp_state 1`:** ports enabled → `listening`; **`blocking` at the
  first hello** (~2 s after br0 came up); `learning` 15.0–15.5 s after the port was enabled,
  `forwarding` 15.0–15.5 s later (a 15 s kernel timer, 512 ms wheel granularity: the sim's
  15.36 s and 30.72 s). A port that becomes root port while listening keeps its timer (no restart).
- **br0 has no carrier until a port forwards**: `5: br0: <NO-CARRIER,BROADCAST,MULTICAST,UP> … state DOWN`
  for the first ~30 s with STP on. Nothing passes while listening (a ping fails, exit 1).
- **BPDUs**: the root sends a config BPDU out of every designated port every hello: first 2 s after
  br0 comes up, then `round_jiffies(now + 2 s)` + wheel rounding, so 1.984, 1.984, 2.048 s apart.
  Newest port first. Non-root bridges send no hellos of their own: they relay on receipt on their
  root port (message age 1 tick = 4 jiffies, `MESSAGE_AGE_INCR`). A designated port that hears an
  inferior BPDU replies, but at most once a second per port (hold timer, `round_jiffies(+1 s)`).
  tcpdump: `STP 802.1d, Config, Flags [none], bridge-id 8000.02:00:00:00:0a:01.8002, length 35`;
  with -e `02:00:00:00:0a:02 > 01:80:c2:00:00:00, 802.3, length 38: LLC, dsap STP (0x42) Individual,
  ssap STP (0x42) Command, ctrl 0x03: …`; flags `[Topology change]`, `[Topology change, Topology
  change ACK]`; a TCN is `STP 802.1d, Topology Change` (`802.3, length 7`). Frame: 52 bytes (14 +
  LLC 42 42 03 + 35); times in 1/256 s (max age 0x1400, hello 0x0200, forward delay 0x0f00).
  The pcap filter `stp` selects them.
- **Learning from BPDUs:** a port in learning/forwarding state learns a BPDU's source MAC (hall-b's
  fdb shows `02:00:00:00:0a:02 dev eth2 master br0`; hall-a learns hall-b's TCN source on eth2).
- **Topology change:** a port going forwarding on a bridge that is designated for some port is a
  topology change. The root sets the TC flag for forward delay + max age (35 s, rounded up to 4.096 s
  by the wheel); a non-root bridge sends a TCN on its root port (again every 2 s until the root's
  TC-ACK). During TC, learned entries expire after **forward delay (15 s)** (`ip -d` shows
  `ageing_time 3000`, i.e. 2 × forward delay) — but they are only removed when the fdb clean-up next
  runs (every ≤ 300 s; `gc_timer`), and until then `bridge fdb show` prints them **`stale`**:
  `02:00:00:00:0b:02 dev eth2 master br0 stale`.
- **Failover** (`ip link set eth2 down` at hall-a: both ends of the active span lose carrier): both
  eth2 ports go `disabled` at once and their learned entries go; hall-b eth3 becomes root port and
  goes `listening` **at once** (direct failure: no max-age wait), `learning` ~15 s and `forwarding`
  ~30 s later; meanwhile pings fail; after that they work. Going forwarding sends a TCN to the root.
- **Turning STP on with the loop closed** (`ip link set br0 type bridge stp_state 1`, no output,
  exit 0): ports already forwarding **stay forwarding** (br_make_forwarding only acts on blocking
  ports). The first hello comes 2 s later. If the other switch doesn't run STP yet it floods the BPDU
  back round the loop, the sender hears its own better port's BPDU on its other span and **blocks
  that port within one hello**: a raging storm (~650,000 frames in 3 s) stopped at once. Once the
  second switch runs STP too, nothing refreshes that stored BPDU: it ages out after max age (20 s),
  the port goes listening, the other switch's span port blocks instead, and ~30 s later the first
  port forwards (`later-*` goldens). Any value but 0 turns it on (`stp_state 2` too).
- **Turning it off again** (`stp_state 0`): states freeze. A blocked port stays `blocking` until its
  stored BPDU ages out (≤ 20 s after the last one), then goes straight to `forwarding` and the loop
  is back (`off-again-*`).
- **Election settings:** `bridge link set dev eth3 cost 1` on hall-b makes eth3 its root port and
  blocks eth2; `ip link set br0 type bridge priority 4096` on hall-b makes it the root (hall-a eth3
  blocks). Errors: port priority > 63 or cost > 65535 → `RTNETLINK answers: Numerical result out of
  range` (255); cost 0 or a word → silently nothing (iproute2 sends a cost only if > 0); a non-port
  or br0 → `RTNETLINK answers: Operation not supported` (255); `dev eth9` → `Cannot find bridge
  device "eth9"`; no `dev` → the long `bridge link set` usage (255).
- **`ip link set <dev> type bridge …` errors:** `stp_state x` → `Error: argument "x" is wrong:
  invalid stp_state` (255); `priority 70000` → `… invalid priority`; an unknown option → `bridge:
  unknown command "frob"?` and the bridge usage (exit 1; `… stp_state 1 up` too: everything after
  `type bridge` is a bridge option); a non-bridge → `RTNETLINK answers: Operation not supported`
  (exit 2); `type frob stp_state 1` → `Garbage instead of arguments "stp_state ...". Try "ip link
  help".` (1); `type frob` alone → nothing (0). `forward_delay` below 2 s or above 30 s is refused
  only while STP is on; `hello_time` (1–10 s) and `max_age` (6–40 s) always (`Numerical result out
  of range`, exit 2).

## Output details the shell must reproduce
- `tcpdump -e` prints the broadcast destination as the word **`Broadcast`**; other MACs in full.
- tcpdump stopped by `-c N` prints its counts straight after the last packet; stopped by Ctrl+C
  (SIGINT) it prints an **empty line first**. `1 packet captured` (singular).
- tcpdump without `-n` replaces the machine's **own** addresses by its hostname (nss-myhostname)
  and adds `(oui Unknown)` after MACs in ARP replies; other addresses stay numeric (no DNS).
- tcpdump UDP ports print by service name (`.discard` for 9).
- `ip addr add` with no prefix gives `/32`. A second address in the same subnet is `secondary`.
- A door whose peer is down: `<NO-CARRIER,BROADCAST,MULTICAST,UP> … state DOWN`; its connected
  route shows `linkdown`.
- Every `ip route` line ends with a trailing space. `ip route get` prints two lines:
  `10.0.2.20 via 10.0.1.1 dev eth0 src 10.0.1.10 uid 0 ` and `    cache ` (`cache <local> ` for own
  addresses, which go `dev lo`).
- Setting a door admin-down removes **all** its routes (connected and default); `ip route` is then
  empty. `ip route add default via <own address>` is accepted.
- `ip route add … via` an off-link gateway, `dev lo`, or with the door down:
  `Error: Nexthop has invalid gateway.` (exit 2).
- `sysctl -w net.ipv4.ip_forward=2` is accepted and reads back as 2.
- Exit codes vary by tool: `ip` uses 1, 2 or 255 depending on the error; `bridge` uses 255.

## DHCP (measured 2026-10-13; `capture-dhcp.sh`, goldens in `dhcp/`, `bytes/dhcp-*`, `tcpdump/tcpdump-dhcp*`)
The pair: **dnsmasq 2.92** (the host's, `--no-daemon -C /dev/null --port=0 -u root -i eth0
--bind-interfaces --dhcp-range=10.0.1.100,10.0.1.150,1h`) and **ISC dhclient 4.4.3-P1** from Fedora 44's
`dhcp-client-4.4.3-26.fc44`, with **Fedora's own dhclient-script**, unpacked from the RPMs (no root).
How it runs without being installed: a `dhclient` wrapper adds `-sf/-lf/-pf`; the script is unchanged
except its `PATH=` line, which also points at the unpacked `ipcalc` (the script needs it for the
prefix). `/run` is private, so `/run/systemd/resolve/stub-resolv.conf` (the target of `/etc/resolv.conf`)
is created empty; dnsmasq needs `-u root` in a user namespace. Nothing else differs.

### The exchange (`dhclient -v eth0`, client 02:00:00:00:00:05, nobody else asking)
| t (s) | frame |
|---|---|
| 0.04–0.09 | DISCOVER, from 0.0.0.0:68 to 255.255.255.255:67, Ethernet broadcast |
| same ms | registry ARPs for its pick (`who-has 10.0.1.149 tell 10.0.1.2`), again at +1.0 and +2.0 s: dnsmasq's **ping check** goes through the kernel's ARP |
| +3.00 | dnsmasq gives up waiting (3 s); it writes the client's MAC into its neighbour table (STALE), so the queued **echo request** goes out unicast to the client, then the **OFFER** (unicast, to the offered address at the client's MAC) |
| +0.4 ms | REQUEST (broadcast, from 0.0.0.0) |
| +0.5 ms | ACK (unicast like the OFFER) |
| +20–38 ms | Fedora's script: `arping -D -c2`: ARP probe from 0.0.0.0, target MAC ff:ff:ff:ff:ff:ff (tcpdump: `who-has 10.0.1.149 (Broadcast) tell 0.0.0.0`) |
| +1.0 s | second probe |
| +1.0 s +~80 ms | address and route configured, `bound to … -- renewal in N seconds.`, dhclient forks: the command exits 0 (total ~5.1–5.2 s) |
| ~ +5 s after the OFFER | the registry's entry (DELAY since the OFFER) probes the client by unicast ARP; answered → REACHABLE |

- **Which address:** dnsmasq seeds from the **sdbm hash of the MAC** (`j = b + (j<<6) + (j<<16) - j` over the 6
  bytes) modulo the range size, then walks up, wrapping: 02:00:00:00:00:05 → .149, :0a → .103 (both
  measured). `--dhcp-sequential-ip` → the lowest free (.100). A client with a lease, or asking for a free
  address with option 50 (after a release), gets it **without a ping**.
- **In use:** if the ping is answered (kitchen holding .149 answered at once), dnsmasq moves to the next
  address immediately and pings that (3 s again): offer .150.
- **While dnsmasq waits on its ping it handles nothing else**: a second DISCOVER (forced with
  `backoff-cutoff 2`) waited, then got its own OFFER at once after the first (no second ping: a free result
  is cached 30 s).
- **`--no-ping`:** OFFER within 1 ms. If the address is taken, **the client's ARP check catches it**:
  kitchen answers the probe, arping stops, the script runs a second arping (probe +15 ms, answered) to
  read the MAC, then `DHCPDECLINE` (broadcast; options 53=4, 54, 50) ~20 ms later; dnsmasq holds the
  address back; 10 s later a fresh DISCOVER (new xid) gets .150. Total ~12.2 s. The registry's STALE
  entry for .149 → client's MAC then probes the client, which doesn't have .149: **FAILED**.
  So with this client **a DHCP duplicate cannot happen**: Fedora's script declines a taken address.
  (Upstream ISC's `client/scripts/linux` and Debian's have no such check; they would configure the
  duplicate. Floor 7's 7.B note assumes they do: see the report to the owner.)
- **No server:** DISCOVER intervals 3 + random(0..5) s, then `interval += random(0..2×interval)`,
  cut back to 7–21 s past 15 s, clamped to the 60 s timeout (measured 3, 4, 8, 12, 14, 20). Each next
  DISCOVER leaves at the next whole second + interval + a random fraction. At ~61 s:
  `No DHCPOFFERS received.`, `No working leases in persistent database - sleeping.`, exit **0** (it stays
  in the background and retries after 5 min). Ctrl+C before that: nothing printed, exit **130**.
- **Packets:** the client's DISCOVER/REQUEST/DECLINE are built by ISC itself: IPv4 TOS **0x10**, TTL
  **128**, id 0, no DF; BOOTP length 300 (zero-padded), flags 0, `secs` 0 on the first DISCOVER.
  Options (DISCOVER): 53, 55 = 1 28 2 121 15 6 12 40 41 42 26 119 3 (13 codes), end. REQUEST: 53, 54,
  50, 55. No client identifier, no hostname. dnsmasq's replies: TOS **0xc0**, TTL 64, no DF, IP id
  from a counter; siaddr = itself; options 53, 54, 51 (3600), 58 (T1 1800), 59 (T2 3150), 1, 28, 3
  (router = **itself by default**; `--dhcp-option=3` sends none, and then there is no default route).
  On veth the server's UDP checksum shows as bad (checksum offload); the simulator computes it.
  dnsmasq's ping: ICMP echo, id random, seq 0, 20 zero bytes (IP length 48), DF, TTL 64.
- **After binding:** `inet 10.0.1.149/24 brd 10.0.1.255 scope global dynamic eth0` /
  `valid_lft 3660sec preferred_lft 3660sec`: **lease + 60 s** (Fedora's script adds a minute), counting
  down in whole seconds (3657 three seconds later). `ip route`: `default via 10.0.1.2 dev eth0 ` (no
  `proto`: the script uses `ip route replace`, so proto boot) and the connected route.
  `renewal in N`: ISC randomises T1 to 3/4..1 of itself (N 1350–1800 less the ~2 s of the check).
- **Renewal** (measured with a 2-minute lease): at T1 a unicast REQUEST from 10.0.1.149:68 to the
  server through an ordinary socket (TOS 0, DF, TTL 64, ciaddr set, options 53, 55); unicast ACK with
  ciaddr echoed; T1/T2 lowered by a random "fuzz" (54/99 instead of 60/105); the same ARP check
  follows; lifetimes start again.
- **`dhclient -r eth0`** with a client running: `Killed old client process`, ~1 s pause, then
  DHCPRELEASE unicast from the address to the server (an ARP for the server first if needed; options
  53=7, 54; ciaddr set), the address and its routes go, exit 0 (~1.07 s). Again afterwards: `Removed
  stale PID file`, and the old lease is released again (from 0.0.0.0, the address being gone). With no
  lease: nothing (just the banner with -v). With the door down: the RELEASE line, then
  `send_packet: Network is unreachable`, `send_packet: please consult README file regarding broadcast
  address.`, `dhclient.c:3587: Failed to send 300 byte long packet over fallback interface.`, exit 0.
- **Errors:** a second `dhclient` while one runs (any door): `dhclient(PID) is already running -
  exiting. ` (trailing space) + Fedora's blurb + `exiting.`, exit 1 (no banner even with -v). Unknown
  door: `Cannot find device "eth9"` (exit 1); with -v also the banner, `Error getting hardware address
  for "eth9": No such device` and the blurb. Unknown option: the banner (even without -v),
  `Unknown command: -Z`, usage, blurb, exit 1.
- **Door down:** the script's PREINIT runs `ip link set dev eth0 up`; the lease follows as usual.
- **No door named:** every broadcast door (here just eth0); the output is the same.
- **Last address removed** (release, `ip addr del`, `ip addr flush`): the door's **neighbour entries
  are flushed too** (fib_disable_ip → arp_ifdown), besides its routes (checked separately with veth).
- tcpdump prints DHCP as `0.0.0.0.bootpc > 255.255.255.255.bootps: BOOTP/DHCP, Request from
  02:00:00:00:00:05, length 300` / `… BOOTP/DHCP, Reply, length 300` (port names even with -n);
  without -n the MAC gets ` (oui Unknown)`.

## Not captured (tool missing)
- Anything needing `tc` (rate-limited storm links): `tc` not installed.
