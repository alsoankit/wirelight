# Known deviations from Linux

Wirelight's simulator and shell treat real Linux as the reference (SRS P-11, SIM-03). Every place we knowingly differ is listed here with the reason. If you find an undocumented difference, it's a bug.

## Interfaces
- **Every door is a physical Ethernet NIC.** Golden captures come from veth pairs in network namespaces (`tools/golden/capture.sh`), which print a few virtual-device details that a real NIC doesn't. The golden test normalizes them: `eth0@ifN` → `eth0`, ` link-netns <ns>` removed, and `qdisc noqueue` → `qdisc fq_codel` (veth has no queue; a single-queue NIC on a modern systemd distro gets `fq_codel` the first time it comes up and keeps it after going down). An interface that has never been up shows `qdisc noop`, as on real Linux.
- **Carrier is instant.** A real link takes a moment to report carrier after both ends come up; the simulator reports it immediately.
- `ip link set lo ...` is accepted and does nothing; `lo` is always up.
- `ip link add/delete/change` are not supported and report `Command "…" is unknown`.

## Shell
- The shell is bash-like, not bash. Unknown commands print `<name>: command not found` (exit 127), like Ubuntu's handler. Only `| grep [-i] [-v] PATTERN` is supported as a pipe; `grep` patterns use JavaScript regular expressions, which agree with grep's basic syntax for ordinary patterns.
- Real Linux commands the player hasn't unlocked yet print `You haven't found this tool yet.` (game rule, FR-CON-11).

## Lab tools (game-only, not Linux)
- `lab send-frame` sends a raw Ethernet II frame with EtherType `0x88B5` (IEEE local experimental) whose payload is UTF-8 text. On an administratively down interface it fails with `Network is down`, as a packet socket would (ENETDOWN). With the interface up but no carrier, the frame is accepted and lost at the door, as on Linux.
- Hosts run a "lab responder" that answers lab frames. Real hosts would ignore this EtherType. Answers go out on EtherType `0x88B6` (the second IEEE local experimental type) and are never answered, so two responders can't echo each other forever (decision 0058).
- The messenger is a game service: every few seconds it sends a lab frame to the door name on its card, or, given a house address, one ICMP echo request built like `ping`'s (decision 0059).
- `lab slate` (the Slate) only reads the trace: it catches frames as they're sent or taken in, peels them and compares them. It never changes the network (decision 0059).

## Machines (how every room's machines are set up)
- **IPv4 only.** Real Linux sends IPv6 (router solicitations, MLD) as soon as a door comes up; the game's machines have IPv6 off, and every golden capture and difftest run disables it. `sysctl -a` still lists net.ipv6 keys, as real Linux does with IPv6 disabled.
- **The kernel's own IPv4 defaults** (ip_forward 0, rp_filter 0, promote_secondaries 0, accept_redirects 1), not a distribution's systemd defaults (rp_filter 2, promote_secondaries 1). New namespaces copy the host's settings, so captures set these explicitly (tools/golden/lib.sh).
- **Switches** are bridges created with `vlan_default_pvid 0`, so `bridge fdb show` doesn't list each entry twice with `vlan 1`. The multicast `self permanent` lines stay.
- **No multicast traffic of their own**: real hosts and bridges send IGMP reports; the simulator doesn't, and the difftest leaves multicast out of its comparisons.
- **No DNS**: anything that isn't an address is a name, and resolution fails (`Temporary failure in name resolution`).

## Frames
- **No padding.** Frames carry the length Linux builds them with (an ARP frame is 42 bytes), as tcpdump shows on the sending machine. A physical network card pads short frames to 60 bytes in hardware, so a capture on a real receiver would show 60 (decision 0057).
- No frame check sequence (FCS), no VLANs.

## Time
- Kernel timers fire as the timer wheel rounds them (HZ=1000): a 1 s ARP retry at 1.024–1.064 s, a 5 s DELAY at 5.0–5.5 s, a 300 s ageing up to ~33 s late (packages/sim/src/wheel.ts). `ping` sleeps the same way (measured 1.024 s apart). A local error reaches `ping` 20 ms after the kernel posts it (process wake-up; approximates what was measured).

- `ping` reads a redirect 1 ms after it arrives (with any reply queued behind it); a socket error (time exceeded, unreachable) is read at once, ahead of them. On Linux the wake-up takes some tens to hundreds of microseconds; what was measured (a redirect followed 0.15 ms later by the error that ends `ping -c 1 -t 2` is never printed, 5 of 5 runs) holds with 1 ms.

## Routing, redirects and switching loops
- **Near-simultaneous frames.** Real veths and bridges hand frames on in microseconds, in an order set by the CPU's softirq queue; the simulator uses a 0.05 ms cable delay. When two machines react to the same frame within a few microseconds (e.g. a redirect's receiver asking for the new gateway while the router asks for the same address), the order of those frames on the wire can differ from Linux. Tables and command output end the same; the difftest primes neighbours where this race would show.
- **Route exceptions** (ICMP redirects) are kept per destination and nexthop (gateway, door, proto) rather than per fib_info; `ip route show cache` lists one under every route that shares the nexthop, as Linux does when routes share a fib_info. Exceptions don't record PMTU (no fragmentation in the game).
- **Spanning tree** (kernel STP, `packages/sim/src/stp.ts`) follows the kernel's br_stp*.c function by function, with its timers on the timer wheel and `round_jiffies` (`tools/golden/LINUX-FACTS.md`, "Spanning tree"). Differences: **port cost is always 2**, what veth reports (10 Gbit/s), although the game's doors are shown as 1 Gbit/s NICs (Linux would give 4); **round_jiffies' phase**: whole seconds of network time stand in for the kernel's jiffies seconds, so hellos fall at the same offsets in every run (on a real machine the phase differs per boot, which the difftest allows for by comparing which BPDUs a door saw, not when); **all ports come up at the same instant** (carrier is instant), where real veths settle a few hundred ms apart, so a real run may send one extra TCN; **no userspace STP** helper, no RSTP, no `bridge -d link`/`ip -d link` details, and of `bridge link set` only `cost` and `priority` (other real options print the usage). Losing carrier on br0 because no port forwards doesn't flush br0's neighbours.
- **The fdb clean-up runs as Linux's** (`br_fdb_cleanup`): one job per bridge, sleeping until the next entry would expire (at most the hold time), so an entry that a topology change has made `stale` stays listed until the job's next run, as measured. Forwarding still uses a stale entry, as br_fdb_find_rcu does (read from the kernel source, not measured: no case produced one in a place where it would show).
- **Switching loops are rate-capped.** On real veths a looped broadcast circles at CPU speed (~1 M frames/s per link, measured for 1 s). In the simulator every cable has a bandwidth and a queue (`LinkSpec.bandwidthBps`, `queueLimit`, default 1 Gbit/s and 64 frames); a storm room sets slow spans (e.g. 64 kbit/s, 16 frames), so a storm runs at a few hundred frames per second per span and frames beyond the queue are dropped (`queue-full`). Linux has no such per-cable queue on veth. Qualitatively the same: one broadcast circles forever, MACs jump between ports, unicast traffic is lost, and taking one loop port down (or unplugging one span) stops it at once.

## Settings
- `sysctl` knows Linux's real `net.*` keys (captured: tools/golden/capture-sysctl-template.sh). `kernel.*`, `vm.*` and `fs.*` describe the capture host, not the game's machines, and aren't listed. Live values: forwarding, `conf.all.accept_redirects` (0 while forwarding is on, as Linux sets it, until written), `send_redirects` / `accept_redirects` (read by the redirect code) and each door's neighbour timers; other keys keep what was written. Writing a door's `forwarding` sets forwarding for the whole machine (Linux keeps it per door).

## tcpdump
- Frames with an EtherType tcpdump doesn't decode (the lab protocol) print their link header without a hex dump of the payload.

## DHCP (the registry and `dhclient`)
- **The reference pair is dnsmasq 2.92 and Fedora 44's ISC dhclient 4.4.3-P1 with Fedora's own dhclient-script** (tools/golden/LINUX-FACTS.md, "DHCP"). Fedora's script checks a new address with `arping -D` and declines it if someone answers, gives the address lifetimes of lease + 60 s (`dynamic`), and uses `ip route replace` (no `proto dhcp`). Upstream ISC's and Debian's scripts differ (no ARP check, lifetime `forever`); the game follows the machine the captures came from. Consequence: a DHCP client never configures a taken address, even when the registry skips its own check (`pingCheck: false`, dnsmasq `--no-ping`).
- **Random values are seeded**: the transaction id, dhclient's retransmission intervals and renewal time, dnsmasq's ping identifier and renewal "fuzz", the process id. Golden files and the difftest normalise them (`xid=<xid>`, `interval <n>`, `renewal in <n> seconds`, `dhclient(<pid>)`).
- **Process timings are fixed** at measured values: dhclient's start (60 ms), the script's start (30 ms), arping (two probes 1 s apart, then 1 s), the configuration (80 ms), `-r`'s kill pause (1 s). Real runs vary by tens of milliseconds.
- **dnsmasq, simplified**: one range per server, no static hosts, no relays (giaddr), no lease file across restarts, `secs` 0 in replies (only measured with `secs` 0), a NAK only for a REQUEST it can't honour. Its 3 s ping wait and the queueing of other messages meanwhile are modelled; its "high load" skip of ping checks isn't.
- **dhclient, simplified**: options other than `-v` and `-r` are accepted and ignored; one pid for all doors; with several doors the command returns when the first is bound (only one door was measured). Rebinding, expiry and REQUEST retransmission follow ISC's source, not a capture (a capture would take most of an hour); renewal was measured once with a 2-minute lease.
- **`ip addr` lifetimes** count down in whole seconds from when the address was set, as the kernel prints them; the kernel's own expiry check (which runs periodically) is modelled as removing the address exactly when `valid_lft` reaches 0.
- **The difftest pins `initial-interval 5` on the real dhclient**: its first retransmission is random (as early as 2 s) and can beat dnsmasq's 3 s ping wait, adding frames a seeded run doesn't have. Only the difftest does this; the goldens use the defaults.

## Not modeled (yet)
- VLANs, STP, multicast group membership, traffic control (`tc`).
