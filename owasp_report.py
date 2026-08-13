"""
Group Semgrep findings by OWASP Top 10 category and CWE.

The OWASP/CWE labels are read from each rule's own metadata in the Semgrep
JSON output, so the mapping reflects whatever version of the rules you scanned
with (Semgrep's rules carry OWASP Top 10 2025 mappings). Nothing is hardcoded.

Usage:
    semgrep --config p/secrets --config p/typescript --config p/react \
            --json --output findings.json .
    python sg_owasp_report.py findings.json                 # print to console
    python sg_owasp_report.py findings.json -o report.txt   # also write a file
    semgrep ... --json . | python sg_owasp_report.py -       # read from stdin
"""
import json
import sys
import argparse
from collections import defaultdict


def as_list(value):
    """Metadata cwe/owasp can be a string or a list; normalise to a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def load(source):
    if source == "-":
        return json.load(sys.stdin)
    with open(source, "r", encoding="utf-8") as f:
        return json.load(f)


def build_report(data):
    # owasp_category -> list of finding dicts
    groups = defaultdict(list)
    for r in data.get("results", []):
        meta = r.get("extra", {}).get("metadata", {})
        owasp = as_list(meta.get("owasp"))
        cwe = as_list(meta.get("cwe"))
        finding = {
            "rule": r.get("check_id", "<unknown-rule>"),
            "path": r.get("path", "<unknown-path>"),
            "line": r.get("start", {}).get("line", "?"),
            "severity": r.get("extra", {}).get("severity", "UNKNOWN"),
            "message": r.get("extra", {}).get("message", "").strip(),
            "cwe": cwe,
        }
        keys = owasp if owasp else ["Unmapped / no OWASP metadata"]
        for k in keys:
            groups[k].append(finding)
    return groups


SEV_ORDER = {"ERROR": 0, "WARNING": 1, "INFO": 2, "UNKNOWN": 3}


def render(groups):
    lines = []
    total = sum(len(v) for v in groups.values())
    lines.append("=" * 70)
    lines.append(f"SEMGREP FINDINGS BY OWASP TOP 10  —  {total} finding(s)")
    lines.append("=" * 70)

    # Sort OWASP categories alphabetically (A01, A02, ...); unmapped last.
    def cat_key(name):
        return (name.startswith("Unmapped"), name)

    for cat in sorted(groups, key=cat_key):
        findings = sorted(
            groups[cat], key=lambda f: SEV_ORDER.get(f["severity"], 3)
        )
        lines.append("")
        lines.append(f"▶ {cat}   ({len(findings)} finding(s))")
        lines.append("-" * 70)
        for f in findings:
            cwe_str = "; ".join(f["cwe"]) if f["cwe"] else "no CWE metadata"
            lines.append(f"  [{f['severity']}] {f['path']}:{f['line']}")
            lines.append(f"      rule : {f['rule']}")
            lines.append(f"      CWE  : {cwe_str}")
            if f["message"]:
                lines.append(f"      note : {f['message']}")
            lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Group Semgrep JSON by OWASP/CWE.")
    ap.add_argument("json_file", help="Semgrep --json output file, or - for stdin")
    ap.add_argument("-o", "--output", help="also write the report to this file")
    args = ap.parse_args()

    data = load(args.json_file)
    report = render(build_report(data))
    print(report)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"\n[written to {args.output}]")


if __name__ == "__main__":
    main()