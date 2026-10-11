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

## Not modeled (yet)
- Frame check sequence (FCS), VLANs, multicast filtering.
