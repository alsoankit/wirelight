#!/usr/bin/env bash
# Builds every sound effect and ambience bed the game ships (gameplay/audio.md, 0021, 0047), then
# registers them in apps/web/public/audio/manifest.json (only the slots listed here; music and voice
# slots in the manifest are left alone).
#
# Sources: Kenney's CC0 audio packs (download them into assets-src/_downloads/kenney-<pack>/extracted/,
# see CREDITS.md) and sounds synthesised here with ffmpeg's audio filters (made for the game).
# Everything is deterministic (fixed noise seeds), so re-running gives the same files.
#
#   tools/audio/make-sfx.sh          # needs ffmpeg (with libopus) and node
#
# Loudness: each file is measured with EBU R128 (ffmpeg's ebur128) and given one linear gain toward
# -20 LUFS (effects) or -28 LUFS (beds), capped so the peak stays under -4 dBFS (effects) or -6 dBFS
# (beds). A plain gain keeps short clicks natural (loudnorm's dynamic mode pumps on sub-second sounds).
# Effects are mono Opus, beds stereo Opus held to a 12 kHz band (so the encoder never switches band
# mid-loop); beds are seamless loops (the tail crossfades into the head).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
K="$ROOT/assets-src/_downloads"
OUT="$ROOT/apps/web/public/audio"
if [[ -n "${KEEP:-}" ]]; then TMP=$KEEP && mkdir -p "$TMP"; else # KEEP=<dir> keeps the layers, to inspect
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
fi
SR=48000
mkdir -p "$OUT/sfx" "$OUT/ambience"

ff() { ffmpeg -hide_banner -loglevel error -nostdin -y "$@"; }

# kenney <pack> <name> → the path of that pack's .ogg
kenney() {
  local f
  f=$(find "$K/kenney-$1/extracted" -name "$2.ogg" -print -quit 2>/dev/null || true)
  [[ -n "$f" ]] || { echo "missing Kenney file: kenney-$1 $2.ogg (download the pack; see CREDITS.md)" >&2; exit 1; }
  echo "$f"
}

# synth <out.wav> <filtergraph ending in [out]>
synth() { ff -filter_complex "$2" -map "[out]" -ar $SR -c:a pcm_f32le "$1"; }

# from <in> <out.wav> <filter chain>: a source file through a filter chain, at 48 kHz
from() { ff -i "$1" -af "aformat=channel_layouts=mono,$3" -ar $SR -c:a pcm_f32le "$2"; }

# ir <out.wav> <seconds> <decay per second> <channels> <lowpass Hz>: a reverb impulse (decaying noise)
ir() {
  local e="(random(0)*2-1)*exp(-$3*t)"
  [[ $4 == 2 ]] && e="$e|(random(1)*2-1)*exp(-$3*t)"
  synth "$1" "aevalsrc='$e':d=$2:s=$SR,lowpass=f=$5,lowpass=f=$5,afade=t=in:d=0.004,afade=t=out:st=$(awk -v d="$2" 'BEGIN{print d*0.6}'):d=$(awk -v d="$2" 'BEGIN{print d*0.4}')[out]"
}
ir "$TMP/ir-room-m.wav" 1.2 4.5 1 5000
ir "$TMP/ir-hall-m.wav" 2.4 2.6 1 3500
ir "$TMP/ir-hall-s.wav" 2.4 2.6 2 3500
ir "$TMP/ir-cave-s.wav" 3.0 2.2 2 3000
ir "$TMP/ir-nave-s.wav" 5.0 1.3 2 2200

# verb <in> <out> <ir> <dry> <wet>: convolution reverb (IR energy-normalised), the tail kept
verb() {
  local len
  len=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$3")
  ff -i "$1" -i "$3" -filter_complex "[0]apad=pad_dur=$len,asplit[d][w];[w][1]afir=irnorm=2[r];[d][r]amix=inputs=2:normalize=0:weights='$4 $5'[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$2"
}

lufs() { ffmpeg -hide_banner -nostats -i "$1" -af "apad=pad_dur=1,ebur128=framelog=quiet" -f null - 2>&1 | awk '$1=="I:"{v=$2} END{print v}'; }
peak() { ffmpeg -hide_banner -nostats -i "$1" -af volumedetect -f null - 2>&1 | awk '/max_volume/{print $5}'; }
# gainfor <wav> <target LUFS> <peak ceiling dBFS>
gainfor() {
  local i p
  i=$(lufs "$1")
  p=$(peak "$1")
  awk -v i="$i" -v p="$p" -v t="$2" -v c="$3" 'BEGIN{ if (i=="" || i=="-inf" || i<-69) i=t; g=t-i; if (g>c-p) g=c-p; printf "%.2f", g }'
}

# sfx <file> <in.wav>: trim silence, soften the ends, one gain, mono Opus → sfx/<file>.ogg
sfx() {
  local t="$TMP/trim-$1.wav" g
  ff -i "$2" -af "aformat=channel_layouts=mono,silenceremove=start_periods=1:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,afade=t=in:d=0.02,areverse,afade=t=in:d=0.002" -ar $SR -c:a pcm_f32le "$t"
  g=$(gainfor "$t" -20 -4)
  ff -i "$t" -af "volume=${g}dB" -c:a libopus -b:a 48k -vbr on -application audio -ac 1 -map_metadata -1 -fflags +bitexact "$OUT/sfx/$1.ogg"
  printf '  sfx/%-24s %+6.2f dB  %s bytes\n' "$1.ogg" "$g" "$(stat -c %s "$OUT/sfx/$1.ogg")"
}

# bed <file> <in.wav> <loop seconds> <crossfade seconds> [channels]: a seamless loop → ambience/<file>.ogg
# (the input is loop+crossfade long; its last seconds crossfade into its first, equal power)
bed() {
  local l="$TMP/loop-$1.wav" ch=${5:-2} g
  ff -i "$2" -i "$2" -filter_complex "[0]atrim=start=$4,asetpts=PTS-STARTPTS[a];[1]atrim=end=$4,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=$4:c1=qsin:c2=qsin,atrim=end=$3[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$l"
  g=$(gainfor "$l" -28 -6)
  ff -i "$l" -af "volume=${g}dB" -c:a libopus -b:a $((ch == 2 ? 40 : 24))k -cutoff 12000 -vbr on -application audio -ac "$ch" -map_metadata -1 -fflags +bitexact "$OUT/ambience/$1.ogg"
  printf '  ambience/%-19s %+6.2f dB  %s bytes\n' "$1.ogg" "$g" "$(stat -c %s "$OUT/ambience/$1.ogg")"
}

# place <src.wav> <seconds> <out.wav> "t:pan:gain" ...: copies of a sound at times, panned (-1..1), stereo
place() {
  local src=$1 len=$2 out=$3
  shift 3
  local n=$# i=0 g mix="" t p v l r ms
  g="[0]aformat=channel_layouts=mono,asplit=$n"
  for ((i = 0; i < n; i++)); do g+="[s$i]"; done
  g+=";"
  i=0
  for ev in "$@"; do
    IFS=: read -r t p v <<<"$ev"
    ms=$(awk -v t="$t" 'BEGIN{printf "%d", t*1000}')
    l=$(awk -v p="$p" -v v="$v" 'BEGIN{printf "%.4f", v*sqrt((1-p)/2)}')
    r=$(awk -v p="$p" -v v="$v" 'BEGIN{printf "%.4f", v*sqrt((1+p)/2)}')
    g+="[s$i]adelay=$ms,pan=stereo|c0=$l*c0|c1=$r*c0,apad=whole_dur=$len[e$i];"
    mix+="[e$i]"
    i=$((i + 1))
  done
  g+="${mix}amix=inputs=$n:normalize=0,atrim=end=$len[out]"
  ff -i "$src" -filter_complex "$g" -map "[out]" -ar $SR -c:a pcm_f32le "$out"
}

# mix <out.wav> <seconds> <in.wav>:<gain> ...: layers summed (stereo)
mix() {
  local out=$1 len=$2
  shift 2
  local args=() g="" m="" i=0 f v
  for x in "$@"; do
    f=${x%:*}
    v=${x##*:}
    args+=(-i "$f")
    g+="[$i]aformat=channel_layouts=stereo,volume=$v,apad=whole_dur=$len[m$i];"
    m+="[m$i]"
    i=$((i + 1))
  done
  ff "${args[@]}" -filter_complex "$g${m}amix=inputs=$i:normalize=0,atrim=end=$len[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$out"
}

# stereo noise: noise2 <out> <seconds> <color> <seedL> <seedR> <filter chain applied to each side>
noise2() {
  synth "$1" "anoisesrc=d=$2:c=$3:r=$SR:seed=$4,$6[l];anoisesrc=d=$2:c=$3:r=$SR:seed=$5,$6[r];[l][r]join=inputs=2:channel_layout=stereo[out]"
}

echo "Kenney (CC0) effects"
soft="highpass=f=60,lowpass=f=7000"
from "$(kenney interface-sounds tick_004)" "$TMP/k-decide.wav" "$soft"
sfx keeper-decide "$TMP/k-decide.wav"
from "$(kenney rpg-audio metalLatch)" "$TMP/k-plug.wav" "highpass=f=80,lowpass=f=6000"
sfx cable-plug "$TMP/k-plug.wav"
from "$(kenney interface-sounds switch_003)" "$TMP/k-unplug.wav" "$soft"
sfx cable-unplug "$TMP/k-unplug.wav"
from "$(kenney interface-sounds switch_004)" "$TMP/k-plate-on.wav" "$soft"
sfx plate-on "$TMP/k-plate-on.wav"
from "$(kenney interface-sounds switch_005)" "$TMP/k-plate-off.wav" "$soft"
sfx plate-off "$TMP/k-plate-off.wav"
from "$(kenney impact-sounds impactWood_light_001)" "$TMP/k-plate-broken.wav" "highpass=f=60,lowpass=f=2500"
sfx plate-broken "$TMP/k-plate-broken.wav"
from "$(kenney rpg-audio metalClick)" "$TMP/k-lock.wav" "highpass=f=80,lowpass=f=6000"
verb "$TMP/k-lock.wav" "$TMP/k-lock-v.wav" "$TMP/ir-room-m.wav" 1 0.2
sfx key-lock "$TMP/k-lock-v.wav"
from "$(kenney ui-audio click2)" "$TMP/k-ui-click.wav" "$soft"
sfx ui-click "$TMP/k-ui-click.wav"
from "$(kenney ui-audio rollover2)" "$TMP/k-ui-hover.wav" "$soft"
sfx ui-hover "$TMP/k-ui-hover.wav"
from "$(kenney interface-sounds maximize_002)" "$TMP/k-ui-open.wav" "highpass=f=80,lowpass=f=5500"
sfx ui-open "$TMP/k-ui-open.wav"
from "$(kenney interface-sounds minimize_002)" "$TMP/k-ui-close.wav" "highpass=f=80,lowpass=f=5500"
sfx ui-close "$TMP/k-ui-close.wav"
from "$(kenney ui-audio click5)" "$TMP/k-key-tick.wav" "highpass=f=200,lowpass=f=6000"
sfx console-key "$TMP/k-key-tick.wav"
from "$(kenney interface-sounds select_002)" "$TMP/k-slate-tap.wav" "$soft"
sfx slate-tap "$TMP/k-slate-tap.wav"
from "$(kenney rpg-audio doorOpen_1)" "$TMP/k-door1.wav" "highpass=f=60,lowpass=f=6000"
verb "$TMP/k-door1.wav" "$TMP/k-door1-v.wav" "$TMP/ir-hall-m.wav" 1 0.3
sfx door-open-1 "$TMP/k-door1-v.wav"
from "$(kenney rpg-audio doorOpen_2)" "$TMP/k-door3.wav" "highpass=f=60,lowpass=f=6000"
verb "$TMP/k-door3.wav" "$TMP/k-door3-v.wav" "$TMP/ir-room-m.wav" 1 0.2
sfx door-open-3 "$TMP/k-door3-v.wav"
for i in 0 1 2; do
  from "$(kenney impact-sounds footstep_concrete_00$i)" "$TMP/k-stone$i.wav" "highpass=f=60,lowpass=f=5000"
  sfx "step-stone-$((i + 1))" "$TMP/k-stone$i.wav"
  from "$(kenney impact-sounds footstep_wood_00$i)" "$TMP/k-wood$i.wav" "highpass=f=40,lowpass=f=5000"
  sfx "step-wood-$((i + 1))" "$TMP/k-wood$i.wav"
done
# Raw material for the beds: creaks (Overgrown Halls, Sorting Works, Lantern Town), the far bell.
for i in 1 2 3; do from "$(kenney rpg-audio creak$i)" "$TMP/creak$i.wav" "highpass=f=100,lowpass=f=1800"; done
# The far bell: Kenney's heavy bell (44.1 kHz) at three-quarter speed, a fourth lower, darkened.
from "$(kenney impact-sounds impactBell_heavy_001)" "$TMP/bell-raw.wav" "asetrate=33075,aresample=$SR,lowpass=f=1400,highpass=f=60"
verb "$TMP/bell-raw.wav" "$TMP/bell-far.wav" "$TMP/ir-hall-m.wav" 0.5 1
sfx bell-far "$TMP/bell-far.wav"
from "$(kenney impact-sounds impactMetal_light_002)" "$TMP/clank.wav" "lowpass=f=1200,highpass=f=80"

echo "Synthesised effects"
# A soft chime for each broadcast copy: a bell-like E6 with quiet partials and a gentle attack.
synth "$TMP/s-chime.wav" "aevalsrc='(0.5*sin(2*PI*1318.5*t)*exp(-6*t)+0.16*sin(2*PI*2637*t)*exp(-10*t)+0.06*sin(2*PI*3955.5*t)*exp(-14*t))*(1-exp(-t/0.004))':d=0.9:s=$SR[out]"
verb "$TMP/s-chime.wav" "$TMP/s-chime-v.wav" "$TMP/ir-room-m.wav" 1 0.15
sfx broadcast-chime "$TMP/s-chime-v.wav"

# The Scanner's capture chime: two notes, E5 then B5.
synth "$TMP/s-capture.wav" "aevalsrc='(0.45*sin(2*PI*659.3*t)*exp(-4*t)+0.1*sin(2*PI*1318.5*t)*exp(-7*t))*(1-exp(-t/0.004))+gte(t,0.13)*(0.45*sin(2*PI*987.8*(t-0.13))*exp(-4*(t-0.13))+0.1*sin(2*PI*1975.5*(t-0.13))*exp(-7*(t-0.13)))*(1-exp(-(t-0.13)/0.004))':d=1.4:s=$SR[out]"
verb "$TMP/s-capture.wav" "$TMP/s-capture-v.wav" "$TMP/ir-room-m.wav" 1 0.2
sfx slate-capture "$TMP/s-capture-v.wav"

# The restoration swell: a warm A-major chord (slightly detuned pairs) rising over 1.8 s, then fading,
# with a breath of filtered air under it.
env="(lt(t,1.8)*pow(t/1.8,2)+gte(t,1.8)*exp(-(t-1.8)*1.1))"
chord="0.22*sin(2*PI*110*t)+0.22*sin(2*PI*110.35*t)+0.16*sin(2*PI*164.8*t)+0.16*sin(2*PI*220.4*t)+0.12*sin(2*PI*277.2*t)+0.1*sin(2*PI*329.6*t)+0.06*sin(2*PI*440.3*t)+0.03*sin(2*PI*659.3*t)"
synth "$TMP/s-swell-a.wav" "aevalsrc='($chord)*$env':d=5:s=$SR,lowpass=f=2500[out]"
synth "$TMP/s-swell-b.wav" "anoisesrc=d=5:c=pink:r=$SR:seed=11:a=0.25,bandpass=f=900:width_type=q:w=0.8,lowpass=f=3000,volume='$env':eval=frame[out]"
ff -i "$TMP/s-swell-a.wav" -i "$TMP/s-swell-b.wav" -filter_complex "[0][1]amix=inputs=2:normalize=0:weights='1 0.35'[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$TMP/s-swell.wav"
verb "$TMP/s-swell.wav" "$TMP/s-swell-v.wav" "$TMP/ir-hall-m.wav" 1 0.45
sfx restore-swell "$TMP/s-swell-v.wav"

# Shimmer (the gift of sight, a memory starting): a quick rising A-major pentatonic sparkle.
shim=""
i=0
for f in 880 987.8 1108.7 1318.5 1480 1760 1975.5 2217.5; do
  t0=$(awk -v i=$i 'BEGIN{printf "%.3f", i*0.07}')
  shim+="+0.13*gte(t,$t0)*sin(2*PI*$f*(t-$t0))*exp(-5*(t-$t0))*(1-exp(-(t-$t0)/0.003))"
  i=$((i + 1))
done
synth "$TMP/s-shimmer.wav" "aevalsrc='0${shim}':d=1.8:s=$SR,lowpass=f=7000[out]"
verb "$TMP/s-shimmer.wav" "$TMP/s-shimmer-v.wav" "$TMP/ir-hall-m.wav" 1 0.35
sfx shimmer "$TMP/s-shimmer-v.wav"

# The memory "rewind": a reversed, reverberant shimmer and a rising breath, landing on a soft tone.
ff -i "$TMP/s-shimmer-v.wav" -af "areverse,atrim=start=0.6,asetpts=PTS-STARTPTS" -ar $SR -c:a pcm_f32le "$TMP/s-rev.wav"
revlen=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/s-rev.wav")
synth "$TMP/s-breath.wav" "anoisesrc=d=$revlen:c=pink:r=$SR:seed=12:a=0.3,bandpass=f=1400:width_type=q:w=0.7,volume='pow(t/$revlen,2)':eval=frame[out]"
synth "$TMP/s-land.wav" "aevalsrc='0.25*(sin(2*PI*440*t)+0.5*sin(2*PI*660*t))*exp(-2.5*t)*(1-exp(-t/0.01))':d=1.5:s=$SR[out]"
ff -i "$TMP/s-rev.wav" -i "$TMP/s-breath.wav" -i "$TMP/s-land.wav" -filter_complex "[2]adelay=$(awk -v d="$revlen" 'BEGIN{printf "%d", (d-0.05)*1000}')[l];[0][1][l]amix=inputs=3:normalize=0:duration=longest:weights='1 0.5 0.6'[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$TMP/s-memory.wav"
sfx memory-rewind "$TMP/s-memory.wav"

# Swooshes: catching a message with the Scanner, and a message passing close to the camera.
# whoosh <out> <seconds> <seed> <low Hz> <high Hz>: a low band then a high band, so it seems to sweep.
whoosh() {
  synth "$1" "anoisesrc=d=$2:c=pink:r=$SR:seed=$3,asplit[a][b];[a]bandpass=f=$4:width_type=q:w=1.2,volume='pow(sin(PI*min(t/($2*0.8),1)),2)':eval=frame[x];[b]bandpass=f=$5:width_type=q:w=1.2,volume='pow(sin(PI*max(t-$2*0.2,0)/($2*0.8)),2)':eval=frame[y];[x][y]amix=inputs=2:normalize=0,lowpass=f=6000[out]"
}
whoosh "$TMP/s-catch.wav" 0.4 13 700 2200
sfx slate-catch "$TMP/s-catch.wav"
whoosh "$TMP/s-pass.wav" 0.6 14 400 1100
sfx message-whoosh "$TMP/s-pass.wav"

# A wind gust (occasional, positional): brown noise in two bands, swelling and dying.
synth "$TMP/s-gust.wav" "anoisesrc=d=3.5:c=brown:r=$SR:seed=15,asplit[a][b];[a]bandpass=f=450:width_type=q:w=1.4[x];[b]bandpass=f=1000:width_type=q:w=3,volume=0.5[y];[x][y]amix=inputs=2:normalize=0,volume='pow(sin(PI*t/3.5),3)':eval=frame,lowpass=f=2000[out]"
sfx wind-gust "$TMP/s-gust.wav"

# A water drip in a stone hall: a short rising blip, then the hall answers with a few soft echoes
# (discrete echoes, not a diffuse wash, which would turn a drip into a hiss).
# drip <out> <start Hz> <sweep>
drip() { synth "$1" "aevalsrc='0.6*sin(2*PI*($2*t+$3*t*t))*exp(-55*t)*(1-exp(-t/0.0015))':d=0.12:s=$SR,lowpass=f=5000,apad=pad_dur=1,aecho=0.9:0.7:150|270|430|640:0.32|0.2|0.12|0.07[out]"; }
drip "$TMP/drip-a.wav" 700 26000
drip "$TMP/drip-b.wav" 900 30000
drip "$TMP/drip-c.wav" 560 22000
verb "$TMP/drip-a.wav" "$TMP/s-drip.wav" "$TMP/ir-room-m.wav" 1 0.12
sfx drip "$TMP/s-drip.wav"

# Keeper's gears: a small ratchet of ticks and a soft clunk.
ratchet() { # ratchet <out> <ticks> <spacing s> <clunk Hz>
  local e="0" i t0 f
  for ((i = 0; i < $2; i++)); do
    t0=$(awk -v i=$i -v s="$3" 'BEGIN{printf "%.3f", i*s}')
    f=$((2900 + (i % 3) * 170))
    e+="+0.35*gte(t,$t0)*sin(2*PI*$f*(t-$t0))*exp(-160*(t-$t0))"
  done
  t0=$(awk -v n="$2" -v s="$3" 'BEGIN{printf "%.3f", n*s}')
  e+="+0.6*gte(t,$t0)*sin(2*PI*$4*(t-$t0))*exp(-22*(t-$t0))*(1-exp(-(t-$t0)/0.002))"
  synth "$1" "aevalsrc='$e':d=$(awk -v t="$t0" 'BEGIN{print t+0.4}'):s=$SR,lowpass=f=6000[out]"
}
ratchet "$TMP/s-gears.wav" 6 0.045 180
verb "$TMP/s-gears.wav" "$TMP/s-gears-v.wav" "$TMP/ir-room-m.wav" 1 0.2
sfx keeper-gears "$TMP/s-gears-v.wav"

# Doors with a floor's flavour: the Sorting Works' geared gate, the Cathedral's stone door.
ratchet "$TMP/s-gate-r.wav" 10 0.07 120
synth "$TMP/s-gate-n.wav" "anoisesrc=d=1.3:c=brown:r=$SR:seed=16:a=0.6,lowpass=f=260,volume='pow(sin(PI*t/1.3),2)':eval=frame[out]"
ff -i "$TMP/s-gate-r.wav" -i "$TMP/s-gate-n.wav" -filter_complex "[0][1]amix=inputs=2:normalize=0:duration=longest:weights='0.8 0.6'[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$TMP/s-gate.wav"
verb "$TMP/s-gate.wav" "$TMP/s-gate-v.wav" "$TMP/ir-hall-m.wav" 1 0.35
sfx door-open-2 "$TMP/s-gate-v.wav"
synth "$TMP/s-stone-n.wav" "anoisesrc=d=2.2:c=brown:r=$SR:seed=17,lowpass=f=320,highpass=f=40,volume='(0.75+0.25*sin(2*PI*7*t))*min(t/0.3,1)*min((2.2-t)/0.4,1)':eval=frame[out]"
synth "$TMP/s-stone-b.wav" "aevalsrc='gte(t,1.9)*0.7*sin(2*PI*62*(t-1.9))*exp(-6*(t-1.9))*(1-exp(-(t-1.9)/0.004))':d=3:s=$SR[out]"
ff -i "$TMP/s-stone-n.wav" -i "$TMP/s-stone-b.wav" -filter_complex "[0][1]amix=inputs=2:normalize=0:duration=longest[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$TMP/s-stone.wav"
verb "$TMP/s-stone.wav" "$TMP/s-stone-v.wav" "$TMP/ir-hall-m.wav" 1 0.5
sfx door-open-4 "$TMP/s-stone-v.wav"

echo "Ambience beds (synthesised; creaks, clank and bell from Kenney)"
# Layer weights are set from measured loudness: the featured layer (wind, chirps, clocks, crickets,
# the deep tone) leads; room tone sits about 10 LU under it.
L=40 # loop length; every steady rhythm below divides it, so the loop point is seamless
X=4  # crossfade
N=$((L + X))

# Hollow wind (stereo): two bands per side, each breathing on its own slow cycle.
# wind <out> <seed> <low Hz> <high Hz> <lowpass Hz>
wind() {
  noise2 "$TMP/w-lo.wav" $N pink "$2" "$(($2 + 1))" "bandpass=f=$3:width_type=q:w=1.3,volume='0.65+0.35*sin(2*PI*t/11+$2)':eval=frame"
  noise2 "$TMP/w-hi.wav" $N pink "$(($2 + 2))" "$(($2 + 3))" "bandpass=f=$4:width_type=q:w=2.5,volume='0.4+0.6*pow(sin(PI*t/13+$2),2)':eval=frame"
  ff -i "$TMP/w-lo.wav" -i "$TMP/w-hi.wav" -filter_complex "[0][1]amix=inputs=2:normalize=0:weights='1 0.45',lowpass=f=$5[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$1"
}
# roomtone <out> <seed> <lowpass Hz>: a soft, still floor of sound
roomtone() { noise2 "$1" $N brown "$2" "$(($2 + 1))" "lowpass=f=$3,highpass=f=30"; }
stereoverb() { verb "$1" "$2" "$3" 1 "$4"; ff -i "$2" -af "atrim=end=$N" -ar $SR -c:a pcm_f32le "$2.t.wav"; mv "$2.t.wav" "$2"; }

# Region 1, the Overgrown Halls. Ruin: hollow wind, gusts, drips, creaks, a faint airy tone.
wind "$TMP/r1-wind.wav" 21 380 900 2200
place "$TMP/s-gust.wav" $N "$TMP/r1-gusts.wav" 8:-0.6:1 26:0.5:0.8
place "$TMP/drip-a.wav" $N "$TMP/r1-drips-a.wav" 2.1:-0.7:1 11.8:0.3:0.8 24.4:-0.2:0.9 36.2:0.6:0.7
place "$TMP/drip-b.wav" $N "$TMP/r1-drips-b.wav" 5.7:0.5:0.8 19.9:-0.5:0.7 31.7:0.2:0.8
place "$TMP/drip-c.wav" $N "$TMP/r1-drips-c.wav" 6.3:0.6:0.6 15.2:-0.3:0.8 25.0:-0.1:0.6
mix "$TMP/r1-drips.wav" $N "$TMP/r1-drips-a.wav:1" "$TMP/r1-drips-b.wav:1" "$TMP/r1-drips-c.wav:1"
stereoverb "$TMP/r1-drips.wav" "$TMP/r1-drips-v.wav" "$TMP/ir-cave-s.wav" 0.15
place "$TMP/creak1.wav" $N "$TMP/r1-creaks-a.wav" 13:0.7:0.5
place "$TMP/creak2.wav" $N "$TMP/r1-creaks-b.wav" 33:-0.6:0.45
mix "$TMP/r1-creaks.wav" $N "$TMP/r1-creaks-a.wav:1" "$TMP/r1-creaks-b.wav:1"
stereoverb "$TMP/r1-creaks.wav" "$TMP/r1-creaks-v.wav" "$TMP/ir-cave-s.wav" 1
synth "$TMP/r1-air.wav" "aevalsrc='0.05*(sin(2*PI*523.3*t)+0.6*sin(2*PI*784*t+1))*pow(sin(PI*t/22),2)|0.05*(sin(2*PI*523.9*t)+0.6*sin(2*PI*784.6*t))*pow(sin(PI*t/22+0.8),2)':d=$N:s=$SR[out]"
mix "$TMP/r1-ruin.wav" $N "$TMP/r1-wind.wav:1" "$TMP/r1-gusts.wav:0.75" "$TMP/r1-drips-v.wav:1.35" "$TMP/r1-creaks-v.wav:0.47" "$TMP/r1-air.wav:0.63"
bed region1-ruin "$TMP/r1-ruin.wav" $L $X

# Region 1 restored: soft room tone, a light breeze, gentle birdsong-like chirps, rare drips.
# chirp <out> <top Hz> <bottom Hz>: two quick downward "twee" notes
chirp() { synth "$1" "aevalsrc='0.4*(lt(t,0.09)*sin(2*PI*($2*t-($2-$3)/0.18*t*t))*pow(sin(PI*t/0.09),2)+gte(t,0.14)*lt(t,0.23)*sin(2*PI*($2*(t-0.14)-($2-$3)/0.18*(t-0.14)*(t-0.14)))*pow(sin(PI*(t-0.14)/0.09),2))':d=0.3:s=$SR[out]"; }
chirp "$TMP/chirp-a.wav" 4200 3100
chirp "$TMP/chirp-b.wav" 3600 2800
chirp "$TMP/chirp-c.wav" 4800 3900
roomtone "$TMP/r1-tone.wav" 31 350
wind "$TMP/r1-breeze.wav" 33 600 1600 3000
place "$TMP/chirp-a.wav" $N "$TMP/r1-ch-a.wav" 3.2:-0.7:1 3.6:-0.7:0.8 17.5:0.4:0.9 29.1:-0.3:0.8 29.5:-0.3:0.7
place "$TMP/chirp-b.wav" $N "$TMP/r1-ch-b.wav" 9.4:0.7:0.8 22.8:-0.5:0.9 23.15:-0.5:0.7 35.6:0.6:0.8
place "$TMP/chirp-c.wav" $N "$TMP/r1-ch-c.wav" 13.1:0.2:0.5 31.9:0.8:0.5
mix "$TMP/r1-chirps.wav" $N "$TMP/r1-ch-a.wav:1" "$TMP/r1-ch-b.wav:1" "$TMP/r1-ch-c.wav:1"
stereoverb "$TMP/r1-chirps.wav" "$TMP/r1-chirps-v.wav" "$TMP/ir-hall-s.wav" 0.3
place "$TMP/drip-b.wav" $N "$TMP/r1-rdrips.wav" 7.5:0.3:0.6 27.3:-0.4:0.5
stereoverb "$TMP/r1-rdrips.wav" "$TMP/r1-rdrips-v.wav" "$TMP/ir-cave-s.wav" 0.12
mix "$TMP/r1-restored.wav" $N "$TMP/r1-tone.wav:0.14" "$TMP/r1-breeze.wav:0.5" "$TMP/r1-chirps-v.wav:0.35" "$TMP/r1-rdrips-v.wav:1.06"
bed region1-restored "$TMP/r1-restored.wav" $L $X

# Region 2, the Sorting Works. Ruin: a dimmer wind indoors, far pipe groans, creaks, a far clank.
wind "$TMP/r2-wind.wav" 41 300 750 1600
synth "$TMP/r2-groan.wav" "aevalsrc='0.3*sin(2*PI*(72*t+3*sin(2*PI*t/9)))*pow(sin(PI*t/22),4)+0.2*sin(2*PI*(96*t+2*sin(2*PI*t/7)))*pow(sin(PI*(t-11)/22),4)':d=$N:s=$SR,lowpass=f=400,aformat=channel_layouts=mono[out]"
place "$TMP/r2-groan.wav" $N "$TMP/r2-groan-s.wav" 0:-0.3:1
place "$TMP/creak3.wav" $N "$TMP/r2-creaks.wav" 7:0.6:0.5 21:-0.5:0.4 34:0.2:0.4
place "$TMP/clank.wav" $N "$TMP/r2-clank.wav" 16:-0.7:0.6 37.5:0.7:0.4
mix "$TMP/r2-far.wav" $N "$TMP/r2-groan-s.wav:1" "$TMP/r2-creaks.wav:0.8" "$TMP/r2-clank.wav:0.6"
stereoverb "$TMP/r2-far.wav" "$TMP/r2-far-v.wav" "$TMP/ir-cave-s.wav" 1
mix "$TMP/r2-ruin.wav" $N "$TMP/r2-wind.wav:0.95" "$TMP/r2-far-v.wav:0.11"
bed region2-ruin "$TMP/r2-ruin.wav" $L $X

# Region 2 restored: soft distant ticking (two clocks, 1 s and 0.8 s), a warm pipe hum, a faint hiss.
synth "$TMP/tick.wav" "aevalsrc='0.5*sin(2*PI*2600*t)*exp(-180*t)+0.3*sin(2*PI*1300*t)*exp(-90*t)':d=0.08:s=$SR,lowpass=f=3000[out]"
ff -i "$TMP/tick.wav" -af "apad=whole_dur=1,aloop=loop=-1:size=$SR,atrim=end=$N" -ar $SR -c:a pcm_f32le "$TMP/r2-clock-a.wav"
ff -i "$TMP/tick.wav" -af "asetrate=$((SR * 5 / 4)),aresample=$SR,apad=whole_dur=0.8,aloop=loop=-1:size=$((SR * 4 / 5)),atrim=end=$N,adelay=400" -ar $SR -c:a pcm_f32le "$TMP/r2-clock-b.wav"
ff -i "$TMP/r2-clock-a.wav" -i "$TMP/r2-clock-b.wav" -filter_complex "[0]pan=stereo|c0=0.8*c0|c1=0.45*c0[a];[1]pan=stereo|c0=0.35*c0|c1=0.7*c0[b];[a][b]amix=inputs=2:normalize=0,atrim=end=$N[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$TMP/r2-clocks.wav"
stereoverb "$TMP/r2-clocks.wav" "$TMP/r2-clocks-v.wav" "$TMP/ir-hall-s.wav" 0.35
synth "$TMP/r2-pipes.wav" "aevalsrc='0.2*sin(2*PI*55*t)+0.12*sin(2*PI*110.25*t)+0.05*sin(2*PI*165*t)|0.2*sin(2*PI*55.2*t)+0.12*sin(2*PI*110*t)+0.05*sin(2*PI*165.3*t)':d=$N:s=$SR,volume='0.8+0.2*sin(2*PI*t/10)':eval=frame[out]"
noise2 "$TMP/r2-hiss.wav" $N pink 51 52 "bandpass=f=3500:width_type=q:w=1,volume='0.5+0.5*pow(sin(PI*t/20),2)':eval=frame"
roomtone "$TMP/r2-tone.wav" 53 300
mix "$TMP/r2-restored.wav" $N "$TMP/r2-tone.wav:0.13" "$TMP/r2-clocks-v.wav:1.05" "$TMP/r2-pipes.wav:0.23" "$TMP/r2-hiss.wav:0.1"
bed region2-restored "$TMP/r2-restored.wav" $L $X

# Region 3, the Lantern Town. Ruin: a cool night wind in empty streets, far wooden creaks.
wind "$TMP/r3-wind.wav" 61 450 1200 2600
place "$TMP/creak1.wav" $N "$TMP/r3-creaks-a.wav" 10:-0.8:0.4
place "$TMP/creak3.wav" $N "$TMP/r3-creaks-b.wav" 28:0.7:0.35
mix "$TMP/r3-creaks.wav" $N "$TMP/r3-creaks-a.wav:1" "$TMP/r3-creaks-b.wav:1"
stereoverb "$TMP/r3-creaks.wav" "$TMP/r3-creaks-v.wav" "$TMP/ir-hall-s.wav" 1
place "$TMP/s-gust.wav" $N "$TMP/r3-gusts.wav" 18:0.4:0.8
mix "$TMP/r3-ruin.wav" $N "$TMP/r3-wind.wav:0.9" "$TMP/r3-creaks-v.wav:0.48" "$TMP/r3-gusts.wav:0.68"
bed region3-ruin "$TMP/r3-ruin.wav" $L $X

# Region 3 restored: night crickets (three, each on its own rhythm), a faint lantern hum and crackle.
# cricket <out> <Hz> <period s> <pulses per s>: bursts of three pulses, every period
cricket() { synth "$1" "aevalsrc='0.3*sin(2*PI*$2*t)*pow(0.5-0.5*cos(2*PI*$4*t),3)*lt(mod(t,$3),3/$4)':d=$N:s=$SR,lowpass=f=7000[out]"; }
cricket "$TMP/cr-a.wav" 4400 0.8 26
cricket "$TMP/cr-b.wav" 5100 1.25 30
cricket "$TMP/cr-c.wav" 3900 1.0 22
ff -i "$TMP/cr-a.wav" -i "$TMP/cr-b.wav" -i "$TMP/cr-c.wav" -filter_complex "[0]pan=stereo|c0=0.8*c0|c1=0.3*c0[a];[1]adelay=300,pan=stereo|c0=0.25*c0|c1=0.6*c0[b];[2]adelay=550,pan=stereo|c0=0.3*c0|c1=0.3*c0[c];[a][b][c]amix=inputs=3:normalize=0:duration=first,atrim=end=$N[out]" -map "[out]" -ar $SR -c:a pcm_f32le "$TMP/r3-crickets.wav"
stereoverb "$TMP/r3-crickets.wav" "$TMP/r3-crickets-v.wav" "$TMP/ir-hall-s.wav" 0.25
synth "$TMP/r3-hum.wav" "aevalsrc='0.1*sin(2*PI*120*t)+0.05*sin(2*PI*240.3*t)+0.02*sin(2*PI*360*t)':d=$N:s=$SR,volume='0.8+0.2*sin(2*PI*t/5)':eval=frame,lowpass=f=600[out]"
noise2 "$TMP/r3-crackle.wav" $N velvet 71 72 "highpass=f=900,lowpass=f=3500,volume=0.5"
wind "$TMP/r3-breeze.wav" 73 500 1400 2600
mix "$TMP/r3-restored.wav" $N "$TMP/r3-crickets-v.wav:0.75" "$TMP/r3-hum.wav:0.32" "$TMP/r3-crackle.wav:0.14" "$TMP/r3-breeze.wav:0.35"
bed region3-restored "$TMP/r3-restored.wav" $L $X

# Region 4, the Cathedral of Crossings. Ruin: deep room tone, wind high in the vault, one far bell.
roomtone "$TMP/r4-tone.wav" 81 160
synth "$TMP/r4-sub.wav" "aevalsrc='0.06*sin(2*PI*41*t)|0.06*sin(2*PI*41.15*t)':d=$N:s=$SR[out]"
wind "$TMP/r4-vaultwind.wav" 83 600 1300 2000
stereoverb "$TMP/r4-vaultwind.wav" "$TMP/r4-vaultwind-v.wav" "$TMP/ir-nave-s.wav" 0.6
place "$TMP/bell-raw.wav" $N "$TMP/r4-bell.wav" 12:-0.3:0.6
stereoverb "$TMP/r4-bell.wav" "$TMP/r4-bell-v.wav" "$TMP/ir-nave-s.wav" 1.2
mix "$TMP/r4-ruin.wav" $N "$TMP/r4-tone.wav:0.34" "$TMP/r4-sub.wav:0.6" "$TMP/r4-vaultwind-v.wav:0.28" "$TMP/r4-bell-v.wav:0.19"
bed region4-ruin "$TMP/r4-ruin.wav" $L $X

# Region 4 restored: a warmer deep tone, the far bell twice, a faint airy pad in fifths.
roomtone "$TMP/r4-warm.wav" 91 220
place "$TMP/bell-raw.wav" $N "$TMP/r4-bells.wav" 8:0.4:0.6 28:-0.4:0.5
stereoverb "$TMP/r4-bells.wav" "$TMP/r4-bells-v.wav" "$TMP/ir-nave-s.wav" 1.2
synth "$TMP/r4-pad.wav" "aevalsrc='0.04*(sin(2*PI*220*t)+0.7*sin(2*PI*330*t)+0.4*sin(2*PI*440.4*t))*(0.6+0.4*sin(2*PI*t/20))|0.04*(sin(2*PI*220.3*t)+0.7*sin(2*PI*329.7*t)+0.4*sin(2*PI*440*t))*(0.6+0.4*sin(2*PI*t/20+1.5))':d=$N:s=$SR,lowpass=f=1500[out]"
stereoverb "$TMP/r4-pad.wav" "$TMP/r4-pad-v.wav" "$TMP/ir-nave-s.wav" 0.8
mix "$TMP/r4-restored.wav" $N "$TMP/r4-warm.wav:0.26" "$TMP/r4-sub.wav:0.4" "$TMP/r4-bells-v.wav:0.23" "$TMP/r4-pad-v.wav:0.27"
bed region4-restored "$TMP/r4-restored.wav" $L $X

# Hums (loops, very quiet, positional): a machine room's low hum, a doorway's glow.
synth "$TMP/hum-machine.wav" "aevalsrc='0.3*sin(2*PI*60*t)+0.15*sin(2*PI*120.2*t)+0.05*sin(2*PI*180*t)':d=12:s=$SR,volume='0.85+0.15*sin(2*PI*t/4)':eval=frame,lowpass=f=500[out]"
bed machine-hum "$TMP/hum-machine.wav" 10 2 1
synth "$TMP/hum-door.wav" "aevalsrc='0.25*sin(2*PI*220*t)+0.25*sin(2*PI*220.5*t)+0.12*sin(2*PI*330*t)+0.06*sin(2*PI*440.25*t)':d=10:s=$SR,volume='0.8+0.2*sin(2*PI*t/2)':eval=frame,lowpass=f=1200[out]"
bed door-hum "$TMP/hum-door.wav" 8 2 1

echo "Licence records"
mkdir -p "$ROOT/assets-src/licenses"
for p in interface-sounds ui-audio impact-sounds rpg-audio; do
  cp "$K/kenney-$p/extracted/License.txt" "$ROOT/assets-src/licenses/kenney-$p-License.txt"
  [[ -f "$K/kenney-$p/page-2026-10-13.html" ]] && cp "$K/kenney-$p/page-2026-10-13.html" "$ROOT/assets-src/licenses/kenney-$p-page-2026-10-13.html"
done

echo "Manifest"
node "$ROOT/tools/audio/register-sfx.mjs"
