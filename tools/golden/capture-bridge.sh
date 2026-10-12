#!/usr/bin/env bash
# Captures real Linux output for `bridge fdb` (and how a switch's doors look in `ip link`).
#
# Topology "switch" (see lib.sh): machine hall with bridge br0 over eth1..eth3, each cabled to a
# host a, b, c. Hosts get IPv4 addresses only in cases that need traffic ("switch-ip"), because
# ping is the simplest way to make a host send frames so the bridge learns its MAC.
# Normalisation and environment choices (IPv6 off, vlan_default_pvid 0): see lib.sh.
# Needs no root. Usage: tools/golden/capture-bridge.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export GOLDEN="$(cd "$here/../.." && pwd)/packages/shell/test/golden"
exec unshare -rmn bash -s "$here" <<'INNER'
set -uo pipefail
source "$1/lib.sh"
start_family bridge bridge

ping_ab='a|ping -c 1 -W 1 10.0.0.2'   # a talks to b: the bridge learns a on eth1 and b on eth2

# A fresh bridge holds only the entries Linux creates itself (port MACs, multicast "self" lines).
case_ fdb-show-fresh         switch    hall 'bridge fdb show'
case_ fdb                    switch    hall 'bridge fdb'
case_ fdb-show-dev           switch    hall 'bridge fdb show dev eth1'
case_ fdb-show-br            switch    hall 'bridge fdb show br br0'
case_ fdb-show-br-dev        switch    hall 'bridge fdb show br br0 dev eth2'
case_ fdb-show-missing-dev   switch    hall 'bridge fdb show dev eth9'
case_ fdb-show-missing-br    switch    hall 'bridge fdb show br br9'
# Learning
case_ fdb-show-learned       'switch ip' hall 'bridge fdb show' "$ping_ab"
case_ fdb-show-learned-dev   'switch ip' hall 'bridge fdb show dev eth2' "$ping_ab"
case_ fdb-show-learned-br    'switch ip' hall 'bridge fdb show br br0' "$ping_ab"
# Ageing: ageing_time is in centiseconds (default 30000 = 300 s); 200 = 2 s to see entries expire.
case_ fdb-show-aged          'switch ip' hall 'bridge fdb show' \
  'hall|ip link set br0 type bridge ageing_time 200' "$ping_ab" 'wait:5'
# Delete
case_ fdb-del-learned        'switch ip' hall 'bridge fdb del 02:00:00:00:00:0a dev eth1 master' "$ping_ab"
case_ fdb-show-after-del     'switch ip' hall 'bridge fdb show' "$ping_ab" \
  'hall|bridge fdb del 02:00:00:00:00:0a dev eth1 master'
case_ fdb-del-missing        switch    hall 'bridge fdb del 02:00:00:00:00:0a dev eth1 master'
case_ fdb-del-wrong-port     'switch ip' hall 'bridge fdb del 02:00:00:00:00:0a dev eth2 master' "$ping_ab"
case_ fdb-del-no-master      'switch ip' hall 'bridge fdb del 02:00:00:00:00:0a dev eth1' "$ping_ab"
case_ fdb-del-missing-dev    switch    hall 'bridge fdb del 02:00:00:00:00:0a dev eth9 master'
case_ fdb-del-no-dev         switch    hall 'bridge fdb del 02:00:00:00:00:0a'
# Add
case_ fdb-add-static         switch    hall 'bridge fdb add 02:00:00:00:00:0c dev eth3 master static'
case_ fdb-show-static        switch    hall 'bridge fdb show' 'hall|bridge fdb add 02:00:00:00:00:0c dev eth3 master static'
case_ fdb-add-sticky         switch    hall 'bridge fdb add 02:00:00:00:00:0c dev eth3 master static sticky'
case_ fdb-show-sticky        switch    hall 'bridge fdb show' 'hall|bridge fdb add 02:00:00:00:00:0c dev eth3 master static sticky'
case_ fdb-add-exists         switch    hall 'bridge fdb add 02:00:00:00:00:0c dev eth3 master static' \
  'hall|bridge fdb add 02:00:00:00:00:0c dev eth3 master static'
case_ fdb-add-exists-learned 'switch ip' hall 'bridge fdb add 02:00:00:00:00:0a dev eth1 master static' "$ping_ab"
case_ fdb-add-bad-mac        switch    hall 'bridge fdb add 02:00:00:00:00 dev eth3 master static'
case_ fdb-add-missing-dev    switch    hall 'bridge fdb add 02:00:00:00:00:0c dev eth9 master static'
case_ fdb-add-no-dev         switch    hall 'bridge fdb add 02:00:00:00:00:0c'
# A static entry on the wrong port: non-sticky MOVES to where the MAC is learned; sticky stays.
case_ fdb-static-moves       'switch ip' hall 'bridge fdb show' \
  'hall|bridge fdb add 02:00:00:00:00:0a dev eth3 master static' "$ping_ab"
case_ fdb-sticky-stays       'switch ip' hall 'bridge fdb show' \
  'hall|bridge fdb add 02:00:00:00:00:0a dev eth3 master static sticky' "$ping_ab"
case_ fdb-sticky-ping        'switch ip' a    'ping -c 2 -W 1 10.0.0.2' \
  'hall|bridge fdb add 02:00:00:00:00:0a dev eth3 master static sticky'
# Errors
case_ fdb-unknown-cmd        switch    hall 'bridge fdb frobnicate'
case_ bridge-unknown-object  switch    hall 'bridge frobnicate'
# How a switch looks to `ip link` / `ip addr`
case_ ip-link-hall           switch    hall 'ip link'
case_ ip-addr-hall           switch    hall 'ip addr'
case_ ip-link-show-br0       switch    hall 'ip link show br0'

finish
INNER
