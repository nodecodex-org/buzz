#!/usr/bin/env python3
"""Reject hosted runners, including matrix and fallback choices (PyYAML 6.0.3)."""
import json
from pathlib import Path
import re
import sys
import yaml

HOSTED = re.compile(r"(?<![\w-])(?:ubuntu|windows|macos)-[\w.-]+(?![\w-])", re.I)
MATRIX = re.compile(r"^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$")

def check_labels(value, matrix):
    if isinstance(value, list):
        if "self-hosted" not in value:
            return "runner label arrays must contain self-hosted"
        if any(HOSTED.search(str(label)) for label in value):
            return "GitHub-hosted label in runner array"
        return None
    if isinstance(value, dict):
        return check_labels(value.get("labels", []), matrix)
    if not isinstance(value, str):
        return "missing or unsupported runner selector"
    if HOSTED.search(value):
        return "GitHub-hosted runner requested"
    if value == "self-hosted":
        return None
    match = MATRIX.fullmatch(value)
    if match:
        key = match[1]
        choices = list(matrix.get(key, []))
        choices += [entry[key] for entry in matrix.get("include", []) if key in entry]
        if not choices:
            return "matrix runner has no statically verifiable choices"
        for choice in choices:
            error = check_labels(choice, {})
            if error:
                return error
        return None
    # Only accept literal arrays, or a fully enclosed conditional whose two
    # possible results are literal arrays. An unknown fallback must fail closed.
    direct = re.fullmatch(r"\$\{\{\s*fromJSON\('([^']+)'\)\s*\}\}", value)
    conditional = re.fullmatch(r"\$\{\{\s*\((.*)\)\s*&&\s*fromJSON\('([^']+)'\)\s*\|\|\s*fromJSON\('([^']+)'\)\s*\}\}", value)
    choices = [direct[1]] if direct else []
    if conditional:
        # Quotes cannot close the outer condition. Reject an early closing
        # parenthesis that could turn an earlier branch into the runner result.
        condition = re.sub(r"'(?:[^']|'')*'", "''", conditional[1])
        depth = 0
        balanced = True
        for char in condition:
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth < 0:
                    balanced = False
                    break
        if balanced and depth == 0:
            choices = [conditional[2], conditional[3]]
    if choices:
        try:
            for choice in choices:
                error = check_labels(json.loads(choice), {})
                if error:
                    return error
            return None
        except (ValueError, TypeError):
            pass
    return "runner must explicitly require self-hosted; dynamic selectors need an audited matrix"

def check_workflow(text):
    document = yaml.safe_load(text)
    if not isinstance(document, dict) or not isinstance(document.get("jobs"), dict):
        return ["workflow has no jobs mapping"]
    errors = []
    for name, job in document["jobs"].items():
        if "uses" in job:
            continue  # A reusable caller cannot set runs-on; audit its source separately.
        error = check_labels(job.get("runs-on"), job.get("strategy", {}).get("matrix", {}))
        if error:
            errors.append(f"{name}: {error}")
    return errors

def main(directory):
    files = sorted(p for p in Path(directory).iterdir() if p.suffix in (".yml", ".yaml"))
    if not files:
        raise SystemExit("No workflow files found")
    failures = []
    for file in files:
        try:
            failures += [f"{file}: {error}" for error in check_workflow(file.read_text(encoding="utf-8"))]
        except (yaml.YAMLError, TypeError, AttributeError, OSError) as error:
            failures.append(f"{file}: unreadable workflow: {error}")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print(f"Runner policy passed: {len(files)} workflows")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else ".github/workflows"))
