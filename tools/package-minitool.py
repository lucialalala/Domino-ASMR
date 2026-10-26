"""Package src/ as a minitool ZIP using only the Python standard library."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src"
OUTPUT = ROOT / "Domino-ASMR-minitool.zip"
ALLOWED = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".woff", ".woff2", ".json"}


class EntryCheck(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        assert not any(key.startswith("on") for key in attributes), "Inline event handler"
        assert tag not in {"iframe", "object", "base"}, "Unsupported HTML element"
        if tag == "meta":
            assert attributes.get("http-equiv", "").lower() != "content-security-policy", "Container owns CSP"
        if tag == "script":
            assert "src" in attributes and attributes.get("type", "") != "module", "Scripts must be external classic scripts"
        for name in ("src", "href"):
            if name in attributes:
                reference = attributes[name]
                assert reference.startswith("./"), "Resource must be local and relative: " + reference
                resolved = (SOURCE / reference).resolve()
                assert SOURCE.resolve() in resolved.parents and resolved.is_file(), "Missing resource: " + reference


def main():
    files = sorted(path for path in SOURCE.rglob("*") if path.is_file())
    assert files and (SOURCE / "index.html").is_file(), "Missing root index.html"
    assert [path.relative_to(SOURCE).as_posix() for path in files if path.suffix == ".html"] == ["index.html"], "Expected one HTML entry"
    for path in files:
        assert not path.is_symlink(), "Symbolic links are not supported"
        assert path.suffix.lower() in ALLOWED and not any(part.startswith(".") for part in path.relative_to(SOURCE).parts), "Unexpected package file"
        if path.suffix in {".html", ".js", ".css"}:
            text = path.read_text(encoding="utf-8")
            assert not re.search(r"https?://|javascript:", text), "External resource or JavaScript URI in " + path.name
            if path.suffix == ".js":
                forbidden = r"\bfetch\s*\(|XMLHttpRequest|\bnew\s+(?:Worker|SharedWorker|WebSocket|EventSource|RTCPeerConnection|Function)\s*\(|\beval\s*\(|WebAssembly|navigator\.(?:geolocation|clipboard|bluetooth|usb|hid|serial|serviceWorker)|requestFullscreen|window\.(?:open|prompt)\s*\("
                assert not re.search(forbidden, text), "Unsupported capability in " + path.name
    entry = (SOURCE / "index.html").read_text(encoding="utf-8")
    assert 'lang="zh-CN"' in entry and 'charset="UTF-8"' in entry and "viewport-fit=cover" in entry
    EntryCheck().feed(entry)
    auditor = ROOT / ".codex/skills/minitool-zip-builder/scripts/audit_artifact.py"
    subprocess.run([sys.executable, str(auditor), str(SOURCE)], check=True)

    # Entries are relative to src/, so index.html is directly at the ZIP root.
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, path.relative_to(SOURCE).as_posix())
    with zipfile.ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None, "ZIP integrity check failed"
        assert "index.html" in archive.namelist() and len(archive.namelist()) == len(files)
        for path in files:
            assert archive.read(path.relative_to(SOURCE).as_posix()) == path.read_bytes(), "Archive/source content mismatch"
    subprocess.run([sys.executable, str(auditor), str(OUTPUT)], check=True)
    print(json.dumps({
        "output": str(OUTPUT), "bytes": OUTPUT.stat().st_size,
        "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
        "entry": "index.html", "files": len(files),
        "sourceBytes": sum(path.stat().st_size for path in files),
        "checks": "PASS: relative resources, classic scripts, capability scan, source/ZIP audits, CRC, byte-for-byte verification",
        "pending": ["Creator platform simulator", "Android device QR verification", "iOS device QR verification", "Actual sound and timing", "Chrome 61 compatibility and real-device performance"]
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
