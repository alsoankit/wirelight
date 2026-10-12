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
- Hosts run a "lab responder" that answers lab frames. Real hosts would ignore this EtherType.

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

## Settings
- `sysctl` knows Linux's real `net.*` keys (captured: tools/golden/capture-sysctl-template.sh). `kernel.*`, `vm.*` and `fs.*` describe the capture host, not the game's machines, and aren't listed. Live values: forwarding and each door's neighbour timers; other keys keep what was written.

## tcpdump
- Frames with an EtherType tcpdump doesn't decode (the lab protocol) print their link header without a hex dump of the payload.

## Not modeled (yet)
- VLANs, STP, multicast group membership, DHCP (Floor 7), traffic control (`tc`).
