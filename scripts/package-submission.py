"""Package the reviewed localnet materials without modifying or publishing them."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / ".local/SwapCircle-localnet-package.zip"
REPORT = ROOT / "docs/evidence/submission-package.json"
SOURCES = {
    "README.md": "submission/README.md",
    "TEAM.json": "TEAM.json",
    "description.md": "submission/description.md",
    "SwapCircle.pdf": "submission/SwapCircle.pdf",
    "demo-localnet.mp4": "submission/demo-localnet.mp4",
    "demo-localnet.evidence.json": "submission/demo-localnet.evidence.json",
    "links.json": "submission/links.json",
    "formal-status.md": "submission/formal-status.md",
    "speaker-notes.txt": "submission/speaker-notes.txt",
}


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def digest(data):
    return sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    captured_at = datetime.now(timezone.utc)
    snapshots = {name: (ROOT / path).read_bytes() for name, path in SOURCES.items()}
    pdf = read_json("docs/evidence/public-pdf.json")
    video = read_json("docs/evidence/video-independent-qc.json")
    public_video = read_json("docs/evidence/public-video.json")
    recording = json.loads(snapshots["demo-localnet.evidence.json"])
    links = json.loads(snapshots["links.json"])
    team = json.loads(snapshots["TEAM.json"])
    pdf_hash = digest(snapshots["SwapCircle.pdf"])
    video_hash = digest(snapshots["demo-localnet.mp4"])
    duration = video["independentTechnicalInspection"]["durationSeconds"]
    require(pdf_hash == pdf["sha256"], "PDF differs from the reviewed public PDF")
    require(pdf["pages"] == 10, "Reviewed PDF must have ten pages")
    require(video_hash == video["sha256"] == public_video["sha256"] == recording["recordingSha256"], "Video hashes disagree")
    require(0 < duration <= 180 and duration == recording["recordingDurationSeconds"], "Video duration evidence is inconsistent or exceeds three minutes")
    require(recording["cluster"] == "localnet" and recording["testWallet"] is True, "Video must identify its localnet/test-wallet scope")
    require(links["submissionSent"] is False, "Reassess packaging status after submission")
    require(team["team_name"] == "DEFOZO SOFTWARE HOUSE" and team["members"] == ["Michał Kiełtyka"], "Team differs from the confirmed team")
    for name, data in snapshots.items():
        if name.endswith((".json", ".md", ".txt")):
            require(not re.search(r"(?<![A-Za-z])[A-Za-z]:[\\/]|/Users/|/home/|BEGIN [A-Z ]*PRIVATE KEY", data.decode("utf-8-sig")), f"Private path or key marker in {name}")

    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    temporary = ARCHIVE.with_suffix(".zip.tmp")
    with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in snapshots.items():
            info = ZipInfo(name, (captured_at.year, captured_at.month, captured_at.day, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    with ZipFile(temporary) as archive:
        require(archive.namelist() == list(SOURCES), "Archive entry list differs from the allowlist")
        require(archive.testzip() is None, "Archive CRC validation failed")
        for name, expected in snapshots.items():
            require(archive.read(name) == expected, f"Archive bytes differ for {name}")
    for name, source in SOURCES.items():
        require((ROOT / source).read_bytes() == snapshots[name], f"Source changed during packaging: {source}; rerun after the edit")
    temporary.replace(ARCHIVE)

    report = {
        "version": 1,
        "packagedAt": captured_at.isoformat(),
        "archive": ARCHIVE.relative_to(ROOT).as_posix(),
        "sha256": digest(ARCHIVE.read_bytes()),
        "bytes": ARCHIVE.stat().st_size,
        "entryCount": len(SOURCES),
        "repository": links["repository"],
        "repositoryHeadAtPackaging": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "scope": "Prepared localnet submission materials, with automated test-wallet signatures. Not devnet or immutable-release acceptance; not a submitted HackTribe entry.",
        "packagingPublishedArchive": False,
        "submissionSent": False,
        "entries": [{"name": name, "source": source, "bytes": len(snapshots[name]), "sha256": digest(snapshots[name])} for name, source in SOURCES.items()],
        "verification": {
            "entryAllowlistExact": True,
            "crcReadbackPassed": True,
            "allEntriesByteIdenticalToSourceSnapshot": True,
            "sourcesUnchangedDuringPackaging": True,
            "pdfAndVideoNotModified": True,
            "textEntriesContainNoAbsolutePrivatePathsOrPrivateKeyMarkers": True,
            "pdf": {"pages": pdf["pages"], "maxPages": 10, "sha256": pdf_hash, "evidence": "docs/evidence/public-pdf.json", "method": "Existing page count bound to the current file by SHA-256; no PDF regeneration"},
            "video": {"durationSeconds": duration, "maxSeconds": 180, "sha256": video_hash, "evidence": ["docs/evidence/video-independent-qc.json", "docs/evidence/public-video.json", "submission/demo-localnet.evidence.json"], "method": "Existing ffprobe duration and reviewed candidate bound to the current file by matching SHA-256; no video re-render"},
        },
        "openGates": ["devnet deployment pending test SOL", "real Phantom and Solflare extension acceptance", "separate deployed immutable release with verified absent upgrade authority", "independent user replay", "recovery through a second RPC provider", "confirmed HackTribe fields, deadline, eligibility and final submission"],
        "complete": True,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"archive": report["archive"], "sha256": report["sha256"], "bytes": report["bytes"], "entryCount": report["entryCount"], "pages": pdf["pages"], "durationSeconds": duration, "complete": True}))


if __name__ == "__main__":
    main()
