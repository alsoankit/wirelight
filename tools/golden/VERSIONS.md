# Versions used for the golden captures (SH-10)

Output changes between versions, so every golden file was captured with exactly these tools.
If you re-capture on a different machine, update this file and review the diff of every golden.

| Tool | Version | How it was read |
|---|---|---|
| iproute2 (`ip`, `bridge`) | 6.17.0 (libbpf 1.6.3) | `ip -V` |
| iputils (`ping`) | 20250605 | `ping -V` |
| tcpdump | 4.99.6 | `tcpdump --version` |
| libpcap | 1.10.6 (64-bit time_t, with TPACKET_V3) | `tcpdump --version` |
| procps-ng (`sysctl`) | 4.0.6 | `sysctl --version` |
| Linux kernel | 7.1.13-200.fc44.x86_64 | `uname -r` |
| dhclient / udhcpc | not installed: no DHCP client goldens yet | |
| tc | not installed | |

Captured on 2026-10-13, Fedora 44, in unprivileged namespaces (`unshare -rmn`), with IPv6 disabled
and IPv4 sysctls reset to kernel defaults in every namespace (see `lib.sh`).
