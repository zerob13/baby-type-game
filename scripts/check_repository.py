"""Check publishable Git history, files, and static output without printing secrets."""

import argparse
import json
from pathlib import Path
import re
import struct
import subprocess
import zlib


PATTERNS = {
    "local-user-path": re.compile(r"/(?:Users|home|var/folders)/|[A-Za-z]:\\Users\\"),
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github-token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    "aws-access-key": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "literal-token": re.compile(r"(?:CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|GH_TOKEN)\s*[:=]\s*['\"]?[A-Za-z0-9_-]{20,}"),
}
EMAIL = re.compile(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PNG_METADATA = {b"tEXt", b"iTXt", b"zTXt", b"eXIf", b"caBX"}


def public_email(value):
    return value in {"i@zerob13.com", "noreply@github.com"} or value.endswith("@users.noreply.github.com")


def forbidden_path(path):
    item = Path(path)
    return any(part in {".git", ".ssh", ".wrangler"} for part in item.parts) or (
        item.name.startswith((".env", ".dev.vars")) and item.name != ".env.example"
    ) or item.name in {".npmrc", "id_rsa", "id_ed25519"} or item.suffix in {
        ".pem", ".key", ".p12", ".pfx"
    } or (item.name.startswith("keybud-save-") and item.suffix == ".json")


def png_issues(raw):
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        return ["invalid-png"]
    offset = 8
    issues = set()
    while offset + 12 <= len(raw):
        length = struct.unpack(">I", raw[offset:offset + 4])[0]
        end = offset + length + 12
        if end > len(raw):
            return ["invalid-png"]
        kind = raw[offset + 4:offset + 8]
        expected_crc = struct.unpack(">I", raw[end - 4:end])[0]
        if zlib.crc32(raw[offset + 4:end - 4]) & 0xFFFFFFFF != expected_crc:
            return ["invalid-png"]
        if kind in PNG_METADATA:
            issues.add("image-metadata")
        offset = end
        if kind == b"IEND":
            if offset != len(raw):
                issues.add("png-trailing-data")
            return sorted(issues)
    return ["invalid-png"]


def blob_issues(path, raw):
    issues = ["private-file"] if forbidden_path(path) else []
    if Path(path).suffix.lower() == ".png":
        return issues + png_issues(raw)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return issues
    issues.extend(name for name, pattern in PATTERNS.items() if pattern.search(text))
    for address in EMAIL.findall(text):
        domain = address.rsplit("@", 1)[1]
        if not public_email(address) and domain not in {"example.com", "example.org", "example.net"}:
            issues.append("personal-email")
            break
    return issues


def git(*args):
    return subprocess.check_output(["git", *args])


def report(path, issues):
    for issue in issues:
        print(json.dumps({"path": path, "issue": issue}))
    return len(issues)


def check_history(ref):
    failures = 0
    seen = set()
    for line in git("log", "--format=%H%x00%ae%x00%ce", ref).decode().splitlines():
        commit, author, committer = line.split("\0")
        if not public_email(author) or not public_email(committer):
            failures += report(commit[:12], ["commit-email-not-approved-for-publication"])
        for entry in git("ls-tree", "-r", "-z", commit).split(b"\0"):
            if not entry:
                continue
            header, name = entry.split(b"\t", 1)
            mode, kind, oid = header.decode().split()
            path = name.decode()
            if kind != "blob" or (oid, path) in seen:
                continue
            seen.add((oid, path))
            failures += report(path, blob_issues(path, git("cat-file", "blob", oid)))
    return failures


def check_markdown(root, path):
    text = path.read_text()
    issues = []
    if text.count("```") % 2:
        issues.append("unclosed-code-fence")
    for link in re.findall(r"!?\[[^\]]*\]\(([^)\n]+)\)", text):
        if "://" in link or link.startswith(("#", "mailto:")):
            continue
        target = (path.parent / link.split("#")[0]).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            issues.append("broken-local-link")
    return issues


def self_test():
    assert blob_issues("notes.txt", b"public documentation") == []
    assert "local-user-path" in blob_issues("notes.txt", "/".join(("", "Users", "child", "notes")).encode())
    assert "personal-email" in blob_issues("notes.txt", b"person" + b"@" + b"mail.invalid")
    assert blob_issues("notes.txt", b"339229+zerob13@users.noreply.github.com") == []
    assert blob_issues("notes.txt", b"i@zerob13.com") == []
    assert "github-token" in blob_issues("notes.txt", b"gh" + b"p_" + b"a" * 40)
    assert "literal-token" in blob_issues("notes.txt", b"CLOUDFLARE_API_TOKEN=" + b"x" * 40)
    assert "private-file" in blob_issues(".env.local", b"")
    assert "private-file" in blob_issues("keybud-save-example.json", b"{}")
    assert blob_issues(".env.example", b"CLOUDFLARE_API_TOKEN=\n") == []

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    start = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
    pixels = chunk(b"IDAT", zlib.compress(b"\0\xff\xff\xff\xff"))
    end = chunk(b"IEND", b"")
    clean = start + pixels + end
    assert png_issues(clean) == []
    assert "image-metadata" in png_issues(start + chunk(b"tEXt", b"author\0private") + pixels + end)
    assert "image-metadata" in png_issues(start + chunk(b"caBX", b"manifest") + pixels + end)
    assert "invalid-png" in png_issues(clean[:-1])
    assert "png-trailing-data" in png_issues(clean + b"extra")
    print("Repository-check self-tests passed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default="HEAD")
    parser.add_argument("--dist", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    root = Path(git("rev-parse", "--show-toplevel").decode().strip()).resolve() if not args.dist else Path.cwd()
    failures = 0
    if args.dist:
        paths = sorted((root / "dist").rglob("*"))
        if not (root / "dist/index.html").is_file():
            failures += report("dist/index.html", ["missing-build-entry"])
        for path in paths:
            if path.is_symlink():
                failures += report(str(path.relative_to(root)), ["build-symlink"])
            elif path.is_file():
                name = str(path.relative_to(root))
                failures += report(name, blob_issues(name, path.read_bytes()))
                if path.suffix == ".map":
                    failures += report(name, ["public-source-map"])
    else:
        failures += check_history(args.ref)
        for name in git("ls-files", "-z").decode().split("\0"):
            if not name:
                continue
            path = root / name
            if path.is_file():
                failures += report(name, blob_issues(name, path.read_bytes()))
                if path.suffix == ".md":
                    failures += report(name, check_markdown(root, path))
    print(f"Repository checks: {failures} issue(s). Matched values are never printed.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
