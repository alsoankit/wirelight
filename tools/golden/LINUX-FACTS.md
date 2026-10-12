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
- **A successful ping on one segment** (observatory → lantern, both fresh):
  - observatory: request (broadcast), reply → entry **REACHABLE** at once.
  - lantern: the request creates its entry for observatory (STALE); sending the echo reply makes
    it **DELAY**; after 5.0–5.3 s lantern sends a **unicast** ARP probe to observatory, gets the
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

## Not captured (tool missing)
- `dhclient` forms (`dhclient [-v] <if>`, `dhclient -r <if>`): no DHCP client installed.
- Anything needing `tc` (rate-limited storm links): `tc` not installed.
