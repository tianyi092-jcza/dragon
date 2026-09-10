"""Offline certified score loops -> OPL3 PCM -> verified-lossless FLAC.

No original SAVE access; no downloads or product runtime dependencies. Requires
existing capstone, node, ffmpeg and OPL3_CORE_MODULE. Only generated music assets
are published; the much larger intermediate WAVs stay in OS temp.
"""

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
TRACKS = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, "OVERBGM"]
parser = argparse.ArgumentParser()
parser.add_argument(
    "--work",
    type=Path,
    default=Path(tempfile.gettempdir()) / "dragon-music-loops" / "extended",
)
parser.add_argument(
    "--reuse-rendered",
    action="store_true",
    help="Reuse already verified loop/PCM artifacts; still validate hashes and lossless FLAC roundtrip",
)
args = parser.parse_args()
work = args.work.resolve()
if not work.is_relative_to(Path(tempfile.gettempdir()).resolve()):
    raise SystemExit("Intermediates must stay in OS temp")
work.mkdir(parents=True, exist_ok=True)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Invalid certificate: {path}") from error


def sha(data):
    return hashlib.sha256(data).hexdigest()


if not args.reuse_rendered:
    subprocess.run(
        [sys.executable, "-B", str(HERE / "extend_music.py"), "--out", str(work)],
        check=True,
    )

original = REPO.parent / "Dragon"
bgm = (original / "BGM.DAT").read_bytes()
assert sha(bgm) == "7a51c8b9a349b9e088f3796b70c268181c60bcebead70942f00e1621523dedc9"
assert (
    sha((original / "YNSOUND.COM").read_bytes())
    == "e2c6a6a8576c4f2a96b7e3f156d7f48c9570ae03539fe9367adb78aebb364fa1"
)
target = REPO / "web" / "grf" / "music" / "loops"
target.mkdir(parents=True, exist_ok=True)
tracks = []
certificates = []
for index in TRACKS:
    label = f"BGM_{index:02}" if isinstance(index, int) else index
    if isinstance(index, int):
        offset, length = struct.unpack_from("<II", bgm, index * 8)
        song = bgm[offset : offset + length]
    else:
        song = (original / "OVERBGM.DAT").read_bytes()
    proof = read_json(work / f"{label}.proof.json")
    assert proof["songSha256"] == sha(song)
    loop = proof["modes"]["audible"]
    assert loop["exactSecondStateAndRegisterSequence"]
    events = work / f"{label}.audible.events.json"
    wav = work / f"{label}.audible.wav"
    if not args.reuse_rendered:
        subprocess.run(
            ["node", str(HERE / "render_irq.mjs"), str(events), str(wav)], check=True
        )
    pcm_cert = read_json(Path(f"{wav}.json"))
    data = wav.read_bytes()
    assert sha(data) == pcm_cert["wavSha256"]
    assert sha(events.read_bytes()) == pcm_cert["sourceSha256"]
    assert (
        pcm_cert["coreSha256"]
        == "74dee027c6e2ba248d06e88a60b6756316280ee3a7563b6c7b42d088e26e8ada"
    )
    assert pcm_cert["rate"] == 49700 and pcm_cert["gain"] == 8
    assert pcm_cert["loopStartSample"] == loop["direct49700Start"]
    assert pcm_cert["loopEndSample"] == loop["direct49700End"] == pcm_cert["samples"]
    assert 0 < pcm_cert["peak"] < 32768 and pcm_cert["rms"] > 0
    assert data[:4] == b"RIFF" and data[36:40] == b"data"
    flac = work / f"{label}.flac"
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-i",
            str(wav),
            "-compression_level",
            "8",
            str(flac),
        ],
        check=True,
    )
    with subprocess.Popen(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-i",
            str(flac),
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "-",
        ],
        stdout=subprocess.PIPE,
    ) as process:
        assert process.stdout is not None
        digest = hashlib.sha256()
        size = 0
        while chunk := process.stdout.read(1 << 20):
            digest.update(chunk)
            size += len(chunk)
        assert process.wait() == 0
    assert size == len(data) - 44 and digest.hexdigest() == sha(data[44:])
    certificate = {
        "index": index,
        "file": flac.name,
        "pcmSha256": digest.hexdigest(),
        "pcmBytes": size,
        "flacSha256": sha(flac.read_bytes()),
        "losslessRoundtrip": True,
        "rate": 49700,
        "loopStartSample": pcm_cert["loopStartSample"],
        "loopEndSample": pcm_cert["loopEndSample"],
    }
    certificates.append(certificate)
    shutil.copyfile(flac, target / flac.name)
    for suffix in [
        "proof.json",
        "audible.events.json",
        "audible.boundary-state.hex",
        "audible.wav.json",
    ]:
        shutil.copyfile(work / f"{label}.{suffix}", target / f"{label}.{suffix}")
    tracks.append(
        {
            "index": index,
            "file": f"loops/{flac.name}",
            "loopStart": pcm_cert["loopStartSample"] / 49700,
            "loopEnd": pcm_cert["loopEndSample"] / 49700,
        }
    )
    print(f"Published {label}: {flac.stat().st_size} bytes", flush=True)
(target / "certificates.json").write_text(
    json.dumps(certificates, indent=2) + "\n", encoding="utf8"
)
(target.parent / "playback.json").write_text(
    json.dumps({"tracks": tracks}, indent=2) + "\n", encoding="utf8"
)
