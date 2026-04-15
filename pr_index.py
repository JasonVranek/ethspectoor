#!/usr/bin/env python3
"""
PR Shadow Indexer -- index open spec PRs as virtual fork overlays.

Fetches open PRs from GitHub, extracts changed items using the same
build pipeline as mainline, diffs against the current mainline index,
and writes overlay JSON files to indexes/pr/{spec}/.

Each overlay stores only the items the PR actually changes, with full
post-PR content and a diff_summary for quick field-level comparison.

Usage:
    # Index all open PRs for consensus-specs
    python3 pr_index.py --spec consensus-specs --repo-dir ./repos/specs/consensus-specs

    # Index a single PR
    python3 pr_index.py --spec consensus-specs --repo-dir ./repos/specs/consensus-specs --pr 1234

    # Clean up merged/closed PR overlays
    python3 pr_index.py --spec consensus-specs --cleanup

    # List indexed PRs
    python3 pr_index.py --list --indexes-dir ./indexes

Requires GITHUB_TOKEN env var or --github-token for API access (60 req/hr without).
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path


# ── GitHub API ───────────────────────────────────────────────────────────

def github_api(endpoint: str, token: str = "") -> dict | list:
    """GET a GitHub API endpoint. Returns parsed JSON."""
    url = f"https://api.github.com{endpoint}"
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"GitHub API error {e.code}: {body[:200]}", file=sys.stderr)
        raise


def fetch_open_prs(owner: str, repo: str, token: str = "",
                   per_page: int = 30) -> list[dict]:
    """Fetch open PRs targeting the default branch."""
    prs = github_api(f"/repos/{owner}/{repo}/pulls?state=open&per_page={per_page}", token)
    return [{
        "number": pr["number"],
        "title": pr["title"],
        "author": pr["user"]["login"],
        "base_ref": pr["base"]["ref"],
        "head_ref": pr["head"]["ref"],
        "head_sha": pr["head"]["sha"],
        "updated_at": pr["updated_at"],
        "url": pr["html_url"],
    } for pr in prs]


def fetch_pr_files(owner: str, repo: str, pr_number: int,
                   token: str = "") -> list[str]:
    """Fetch list of files changed by a PR."""
    files = github_api(f"/repos/{owner}/{repo}/pulls/{pr_number}/files?per_page=100", token)
    return [f["filename"] for f in files]


def is_spec_file(filename: str, spec_name: str) -> bool:
    """Check if a file is a spec file (not CI, tests, docs-only, etc)."""
    # consensus-specs and execution-specs: specs/ directory
    if filename.startswith("specs/"):
        return True
    # OpenAPI specs
    if filename.endswith((".yaml", ".yml")) and not filename.startswith("."):
        # builder-specs, relay-specs, beacon-apis, remote-signing-api
        if any(d in filename for d in ["apis/", "types/", "beacon-node-oapi"]):
            return True
        # top-level yaml for simple specs
        if "/" not in filename or filename.count("/") == 1:
            return True
    # execution-apis: openrpc json
    if filename.endswith(".json") and "openrpc" in filename.lower():
        return True
    # Python source for execution-specs
    if filename.startswith("src/") and filename.endswith(".py"):
        return True
    return False


# ── Git worktree management ──────────────────────────────────────────────

def fetch_pr_branch(repo_dir: str, pr_number: int) -> str:
    """Fetch a PR branch into the repo. Returns the local ref name."""
    ref_name = f"pr-{pr_number}"
    subprocess.run(
        ["git", "fetch", "origin", f"pull/{pr_number}/head:{ref_name}"],
        cwd=repo_dir, capture_output=True, check=True,
    )
    return ref_name


def create_worktree(repo_dir: str, ref_name: str, work_dir: str):
    """Create a git worktree for a ref."""
    subprocess.run(
        ["git", "worktree", "add", work_dir, ref_name],
        cwd=repo_dir, capture_output=True, check=True,
    )


def remove_worktree(repo_dir: str, work_dir: str):
    """Remove a git worktree."""
    subprocess.run(
        ["git", "worktree", "remove", "--force", work_dir],
        cwd=repo_dir, capture_output=True,
    )
    # Also prune dangling worktrees
    subprocess.run(
        ["git", "worktree", "prune"],
        cwd=repo_dir, capture_output=True,
    )


def cleanup_pr_ref(repo_dir: str, pr_number: int):
    """Delete the local PR ref."""
    subprocess.run(
        ["git", "branch", "-D", f"pr-{pr_number}"],
        cwd=repo_dir, capture_output=True,
    )


# ── Extraction ───────────────────────────────────────────────────────────

def extract_pr_index(spec_name: str, worktree_dir: str, output_dir: str,
                     branch: str = "dev") -> str:
    """Run build.py against a worktree, return the index path."""
    build_script = str(Path(__file__).parent / "build.py")
    output_path = os.path.join(output_dir, f"{spec_name}_index.json")

    cmd = [
        sys.executable, build_script,
        "--profile", spec_name,
        "--repo-dir", worktree_dir,
        "--output-dir", output_dir,
        "--branch", branch,
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"  build.py failed: {proc.stderr[-500:]}", file=sys.stderr)
        raise RuntimeError(f"Extraction failed for {spec_name}")

    return output_path


# ── Diffing ──────────────────────────────────────────────────────────────

def diff_fields(mainline_fields: list, pr_fields: list) -> dict:
    """Diff two field lists, return summary."""
    main_by_name = {f["name"]: f for f in (mainline_fields or [])}
    pr_by_name = {f["name"]: f for f in (pr_fields or [])}

    added = [n for n in pr_by_name if n not in main_by_name]
    removed = [n for n in main_by_name if n not in pr_by_name]
    modified = []
    for n in pr_by_name:
        if n in main_by_name:
            pf = pr_by_name[n]
            mf = main_by_name[n]
            if pf.get("type") != mf.get("type") or pf.get("comment") != mf.get("comment"):
                modified.append(n)

    return {
        "fields_added": added,
        "fields_removed": removed,
        "fields_modified": modified,
    }


def diff_item_at_fork(mainline_fork_data: dict, pr_fork_data: dict) -> dict:
    """Diff a single item at a single fork. Returns diff_summary."""
    summary = {}

    # Field diff
    m_fields = mainline_fork_data.get("fields", [])
    p_fields = pr_fork_data.get("fields", [])
    if m_fields or p_fields:
        summary.update(diff_fields(m_fields, p_fields))

    # Code diff
    m_code = mainline_fork_data.get("code", "")
    p_code = pr_fork_data.get("code", "")
    summary["code_changed"] = (m_code != p_code)

    # Param diff (for functions)
    m_params = mainline_fork_data.get("params", [])
    p_params = pr_fork_data.get("params", [])
    if m_params != p_params:
        summary["params_changed"] = True

    return summary


def diff_indexes(mainline_path: str, pr_path: str,
                 target_forks: list[str] | None = None) -> dict:
    """Diff a PR index against mainline. Returns items_changed, constants_changed.

    Only stores items that actually differ. For each changed item, stores
    the full PR version (for direct lookup) plus a diff_summary.
    """
    with open(mainline_path) as f:
        mainline = json.load(f)
    with open(pr_path) as f:
        pr_idx = json.load(f)

    m_items = mainline.get("items", {})
    p_items = pr_idx.get("items", {})
    m_fork_order = mainline.get("_meta", {}).get("fork_order", [])
    p_fork_order = pr_idx.get("_meta", {}).get("fork_order", [])

    # If no target forks specified, compare all forks in the PR index
    if not target_forks:
        target_forks = p_fork_order

    items_changed = {}

    # Check all item names in both indexes
    all_names = set(list(m_items.keys()) + list(p_items.keys()))

    for name in sorted(all_names):
        m_item = m_items.get(name, {})
        p_item = p_items.get(name, {})
        m_forks = m_item.get("forks", {})
        p_forks = p_item.get("forks", {})

        for fork in target_forks:
            m_fd = m_forks.get(fork)
            p_fd = p_forks.get(fork)

            if p_fd and not m_fd:
                # New item/fork in PR
                items_changed[name] = {
                    "action": "added",
                    "fork": fork,
                    "kind": p_item.get("kind", ""),
                    "domain": p_item.get("domain", ""),
                    **{k: p_fd[k] for k in p_fd if k not in ("is_new", "is_modified")},
                    "diff_summary": {"new": True},
                }
            elif m_fd and not p_fd:
                # Removed in PR
                items_changed[name] = {
                    "action": "removed",
                    "fork": fork,
                    "kind": m_item.get("kind", ""),
                    "domain": m_item.get("domain", ""),
                    "diff_summary": {"removed": True},
                }
            elif m_fd and p_fd:
                # Both exist -- check for differences
                diff = diff_item_at_fork(m_fd, p_fd)
                has_diff = (
                    diff.get("code_changed") or
                    diff.get("fields_added") or
                    diff.get("fields_removed") or
                    diff.get("fields_modified") or
                    diff.get("params_changed")
                )
                if has_diff:
                    items_changed[name] = {
                        "action": "modified",
                        "fork": fork,
                        "kind": p_item.get("kind", ""),
                        "domain": p_item.get("domain", ""),
                        **{k: p_fd[k] for k in p_fd if k not in ("is_new", "is_modified")},
                        "diff_summary": diff,
                    }

    # Constants diff
    m_consts = mainline.get("constants", {})
    p_consts = pr_idx.get("constants", {})
    constants_changed = {}

    all_const_names = set(list(m_consts.keys()) + list(p_consts.keys()))
    for name in sorted(all_const_names):
        m_c = m_consts.get(name)
        p_c = p_consts.get(name)

        # Normalize: constants can be a list of dicts or a dict
        if isinstance(m_c, list) and m_c:
            m_c = m_c[-1]
        if isinstance(p_c, list) and p_c:
            p_c = p_c[-1]

        if p_c and not m_c:
            constants_changed[name] = {
                "action": "added",
                "value": p_c.get("value", ""),
                "fork": p_c.get("fork", ""),
            }
        elif m_c and not p_c:
            constants_changed[name] = {
                "action": "removed",
                "old_value": m_c.get("value", ""),
            }
        elif m_c and p_c and m_c.get("value") != p_c.get("value"):
            constants_changed[name] = {
                "action": "modified",
                "value": p_c.get("value", ""),
                "old_value": m_c.get("value", ""),
                "fork": p_c.get("fork", ""),
            }

    return {
        "items_changed": items_changed,
        "constants_changed": constants_changed,
    }


# ── Overlay I/O ──────────────────────────────────────────────────────────

def write_overlay(output_dir: str, spec_name: str, pr_meta: dict,
                  diff_result: dict):
    """Write a PR overlay JSON file."""
    pr_dir = Path(output_dir) / "pr" / spec_name
    pr_dir.mkdir(parents=True, exist_ok=True)

    overlay = {
        "_meta": {
            "type": "pr_overlay",
            "spec": spec_name,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        **pr_meta,
        **diff_result,
    }

    out_path = pr_dir / f"pr-{pr_meta['number']}.json"
    with open(out_path, "w") as f:
        json.dump(overlay, f, indent=2)

    n_items = len(diff_result.get("items_changed", {}))
    n_consts = len(diff_result.get("constants_changed", {}))
    print(f"  Wrote {out_path.name}: {n_items} items, {n_consts} constants changed",
          file=sys.stderr)
    return str(out_path)


def load_overlays(indexes_dir: str, spec_name: str = "") -> list[dict]:
    """Load all PR overlay files, optionally filtered by spec."""
    pr_dir = Path(indexes_dir) / "pr"
    if not pr_dir.exists():
        return []

    overlays = []
    spec_dirs = [pr_dir / spec_name] if spec_name else list(pr_dir.iterdir())
    for sdir in spec_dirs:
        if not sdir.is_dir():
            continue
        for f in sorted(sdir.glob("pr-*.json")):
            with open(f) as fh:
                overlays.append(json.load(fh))
    return overlays


# ── Main pipeline ────────────────────────────────────────────────────────

# Map spec names to their default branch and repo subdir pattern
SPEC_BRANCHES = {
    "consensus-specs": "dev",
}

# Files that indicate a PR touches spec content (quick heuristic)
SPEC_DIRS = {
    "consensus-specs": ["specs/"],
    "execution-specs": ["src/", "specs/"],
    "builder-specs": ["specs/", "builder-oapi.yaml", "types/"],
    "relay-specs": ["specs/", "relay-oapi.yaml", "types/"],
    "beacon-apis": ["apis/", "types/", "beacon-node-oapi.yaml"],
    "execution-apis": ["src/", "openrpc.json"],
    "remote-signing-api": ["spec/", "types/"],
}


def pr_touches_specs(files: list[str], spec_name: str) -> bool:
    """Check if any PR file touches spec content."""
    prefixes = SPEC_DIRS.get(spec_name, ["specs/"])
    return any(
        any(f.startswith(p) or f == p for p in prefixes)
        for f in files
    )


def index_single_pr(spec_name: str, repo_dir: str, pr_meta: dict,
                    mainline_index_path: str, indexes_dir: str,
                    token: str = "") -> str | None:
    """Index a single PR: fetch, extract, diff, write overlay. Returns overlay path."""
    pr_number = pr_meta["number"]
    owner_repo = None

    # Get owner/repo from the mainline index metadata
    with open(mainline_index_path) as f:
        mainline = json.load(f)
    source = mainline.get("_meta", {}).get("source", "")
    if "/" in source:
        owner, repo = source.split("/", 1)
        owner_repo = (owner, repo)

    # Check which files the PR touches
    if owner_repo:
        try:
            files = fetch_pr_files(*owner_repo, pr_number, token)
        except Exception as e:
            print(f"  Failed to fetch PR #{pr_number} files: {e}", file=sys.stderr)
            return None

        if not pr_touches_specs(files, spec_name):
            print(f"  PR #{pr_number} doesn't touch spec files, skipping", file=sys.stderr)
            return None

    print(f"  Fetching PR #{pr_number} branch...", file=sys.stderr)
    try:
        ref_name = fetch_pr_branch(repo_dir, pr_number)
    except subprocess.CalledProcessError as e:
        print(f"  Failed to fetch PR #{pr_number}: {e.stderr.decode()[:200]}", file=sys.stderr)
        return None

    # Create worktree in temp dir
    work_dir = tempfile.mkdtemp(prefix=f"ethspectoor-pr-{spec_name}-{pr_number}-")
    tmp_output = tempfile.mkdtemp(prefix=f"ethspectoor-pr-output-{pr_number}-")

    try:
        print(f"  Extracting PR #{pr_number} into worktree...", file=sys.stderr)
        create_worktree(repo_dir, ref_name, work_dir)

        branch = SPEC_BRANCHES.get(spec_name, "main")
        pr_index_path = extract_pr_index(spec_name, work_dir, tmp_output, branch)

        print(f"  Diffing against mainline...", file=sys.stderr)
        diff_result = diff_indexes(mainline_index_path, pr_index_path)

        if not diff_result["items_changed"] and not diff_result["constants_changed"]:
            print(f"  PR #{pr_number} has no spec item changes, skipping", file=sys.stderr)
            return None

        overlay_path = write_overlay(indexes_dir, spec_name, pr_meta, diff_result)
        return overlay_path

    except Exception as e:
        print(f"  Error indexing PR #{pr_number}: {e}", file=sys.stderr)
        return None

    finally:
        # Cleanup
        remove_worktree(repo_dir, work_dir)
        cleanup_pr_ref(repo_dir, pr_number)
        shutil.rmtree(work_dir, ignore_errors=True)
        shutil.rmtree(tmp_output, ignore_errors=True)


def index_prs(spec_name: str, repo_dir: str, indexes_dir: str,
              token: str = "", pr_number: int | None = None,
              per_page: int = 30):
    """Index open PRs for a spec. If pr_number given, index only that PR."""

    mainline_index = Path(indexes_dir) / f"{spec_name}_index.json"
    if not mainline_index.exists():
        print(f"Error: mainline index not found: {mainline_index}", file=sys.stderr)
        print(f"Run build.py --profile {spec_name} first.", file=sys.stderr)
        sys.exit(1)

    # Get owner/repo from index metadata
    with open(mainline_index) as f:
        meta = json.load(f).get("_meta", {})
    source = meta.get("source", "")
    if "/" not in source:
        print(f"Error: can't determine GitHub owner/repo from index metadata: {source}",
              file=sys.stderr)
        sys.exit(1)
    owner, repo = source.split("/", 1)

    if pr_number:
        # Index a specific PR -- fetch its metadata
        print(f"Fetching PR #{pr_number} metadata...", file=sys.stderr)
        try:
            pr_data = github_api(f"/repos/{owner}/{repo}/pulls/{pr_number}", token)
            pr_meta = {
                "number": pr_data["number"],
                "title": pr_data["title"],
                "author": pr_data["user"]["login"],
                "base_ref": pr_data["base"]["ref"],
                "head_ref": pr_data["head"]["ref"],
                "head_sha": pr_data["head"]["sha"],
                "updated_at": pr_data["updated_at"],
                "url": pr_data["html_url"],
            }
        except Exception as e:
            print(f"Error fetching PR #{pr_number}: {e}", file=sys.stderr)
            sys.exit(1)

        result = index_single_pr(spec_name, repo_dir, pr_meta,
                                 str(mainline_index), indexes_dir, token)
        if result:
            print(f"\nDone. Overlay: {result}", file=sys.stderr)
        else:
            print(f"\nPR #{pr_number} produced no overlay (no spec changes).", file=sys.stderr)
        return

    # Index all open PRs
    print(f"Fetching open PRs for {owner}/{repo}...", file=sys.stderr)
    prs = fetch_open_prs(owner, repo, token, per_page)
    print(f"Found {len(prs)} open PRs", file=sys.stderr)

    indexed = 0
    skipped = 0
    for pr_meta in prs:
        print(f"\nPR #{pr_meta['number']}: {pr_meta['title']}", file=sys.stderr)

        # Check if we already have an up-to-date overlay
        existing = Path(indexes_dir) / "pr" / spec_name / f"pr-{pr_meta['number']}.json"
        if existing.exists():
            with open(existing) as f:
                old = json.load(f)
            if old.get("head_sha") == pr_meta["head_sha"]:
                print(f"  Already up-to-date (sha: {pr_meta['head_sha'][:8]})", file=sys.stderr)
                skipped += 1
                continue

        result = index_single_pr(spec_name, repo_dir, pr_meta,
                                 str(mainline_index), indexes_dir, token)
        if result:
            indexed += 1
        else:
            skipped += 1

    print(f"\nDone. Indexed: {indexed}, Skipped: {skipped}", file=sys.stderr)


def cleanup_prs(spec_name: str, indexes_dir: str, token: str = ""):
    """Remove overlays for merged/closed PRs."""
    pr_dir = Path(indexes_dir) / "pr" / spec_name
    if not pr_dir.exists():
        print(f"No PR overlays for {spec_name}", file=sys.stderr)
        return

    # Get owner/repo from mainline index
    mainline_index = Path(indexes_dir) / f"{spec_name}_index.json"
    if not mainline_index.exists():
        print(f"Warning: mainline index not found, can't verify PR status", file=sys.stderr)
        return

    with open(mainline_index) as f:
        source = json.load(f).get("_meta", {}).get("source", "")
    if "/" not in source:
        return
    owner, repo = source.split("/", 1)

    removed = 0
    for overlay_file in sorted(pr_dir.glob("pr-*.json")):
        pr_number = int(overlay_file.stem.replace("pr-", ""))
        try:
            pr_data = github_api(f"/repos/{owner}/{repo}/pulls/{pr_number}", token)
            state = pr_data.get("state", "")
            if state != "open":
                print(f"  PR #{pr_number} is {state}, removing overlay", file=sys.stderr)
                overlay_file.unlink()
                removed += 1
        except Exception as e:
            print(f"  Error checking PR #{pr_number}: {e}", file=sys.stderr)

    print(f"Cleanup done. Removed {removed} stale overlays.", file=sys.stderr)


def list_prs(indexes_dir: str, spec_name: str = ""):
    """List all indexed PR overlays."""
    overlays = load_overlays(indexes_dir, spec_name)
    if not overlays:
        print("No PR overlays found.", file=sys.stderr)
        return

    for ov in overlays:
        n_items = len(ov.get("items_changed", {}))
        n_consts = len(ov.get("constants_changed", {}))
        spec = ov.get("_meta", {}).get("spec", "?")
        print(f"  PR #{ov['number']} ({spec}): \"{ov.get('title', '')}\" "
              f"by {ov.get('author', '?')} -- "
              f"{n_items} items, {n_consts} constants changed "
              f"[{ov.get('updated_at', '')[:10]}]")


# ── CLI ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="PR Shadow Indexer -- index open spec PRs as virtual fork overlays"
    )
    parser.add_argument("--spec", help="Spec name (e.g. consensus-specs)")
    parser.add_argument("--repo-dir", help="Path to local spec repo clone")
    parser.add_argument("--indexes-dir", default="./indexes", help="Indexes directory")
    parser.add_argument("--pr", type=int, help="Index a specific PR number")
    parser.add_argument("--cleanup", action="store_true", help="Remove stale overlays")
    parser.add_argument("--list", action="store_true", dest="list_prs",
                        help="List indexed PR overlays")
    parser.add_argument("--github-token", default=os.environ.get("GITHUB_TOKEN", ""),
                        help="GitHub API token (or set GITHUB_TOKEN env)")
    parser.add_argument("--per-page", type=int, default=30,
                        help="PRs per page when fetching all open PRs")
    args = parser.parse_args()

    if args.list_prs:
        list_prs(args.indexes_dir, args.spec or "")
        return

    if args.cleanup:
        if not args.spec:
            parser.error("--cleanup requires --spec")
        cleanup_prs(args.spec, args.indexes_dir, args.github_token)
        return

    if not args.spec:
        parser.error("--spec is required (unless using --list)")
    if not args.repo_dir:
        parser.error("--repo-dir is required")

    index_prs(args.spec, args.repo_dir, args.indexes_dir,
              args.github_token, args.pr, args.per_page)


if __name__ == "__main__":
    main()
