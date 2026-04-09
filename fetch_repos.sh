#!/usr/bin/env bash
#
# Fetch all Ethereum spec repos used by The Inspectoor.
# Clones into ./repos/ by default.
#
# Usage:
#   ./fetch_repos.sh              # clone all repos into ./repos/
#   ./fetch_repos.sh /path/to    # clone into a custom directory
#   ./fetch_repos.sh --update     # pull latest for existing clones

set -euo pipefail

REPOS_DIR="${1:-./repos}"
UPDATE=false

if [ "${1:-}" = "--update" ]; then
    UPDATE=true
    REPOS_DIR="${2:-./repos}"
fi

# Spec repos and their clone paths
declare -A REPOS=(
    ["specs/consensus-specs"]="https://github.com/ethereum/consensus-specs.git"
    ["specs/builder-specs"]="https://github.com/ethereum/builder-specs.git"
    ["specs/relay-specs"]="https://github.com/flashbots/relay-specs.git"
    ["specs/beacon-APIs"]="https://github.com/ethereum/beacon-APIs.git"
    ["specs/execution-specs"]="https://github.com/ethereum/execution-specs.git"
    ["specs/execution-apis"]="https://github.com/ethereum/execution-apis.git"
    ["specs/remote-signing-api"]="https://github.com/ethereum/remote-signing-api.git"
)

# Branch overrides (default: main)
declare -A BRANCHES=(
    ["specs/consensus-specs"]="dev"
)

echo "The Inspectoor -- Fetching Ethereum spec repos"
echo "Target: $REPOS_DIR"
echo ""

mkdir -p "$REPOS_DIR"

for path in $(echo "${!REPOS[@]}" | tr ' ' '\n' | sort); do
    url="${REPOS[$path]}"
    full_path="$REPOS_DIR/$path"
    branch="${BRANCHES[$path]:-main}"
    name=$(basename "$path")

    if [ -d "$full_path/.git" ]; then
        if $UPDATE; then
            echo "  Updating $name ($branch)..."
            (cd "$full_path" && git fetch origin && git checkout "$branch" 2>/dev/null && git pull --ff-only origin "$branch") || \
                echo "    Warning: could not update $name"
        else
            echo "  Skip $name (already cloned)"
        fi
    else
        echo "  Cloning $name ($branch)..."
        mkdir -p "$(dirname "$full_path")"
        git clone --depth 1 --branch "$branch" "$url" "$full_path" 2>&1 | sed 's/^/    /'
    fi
done

echo ""
echo "Done. Repos at: $REPOS_DIR"
echo ""
echo "Build indexes:"
echo "  python3 build.py --profile consensus-specs --repo-dir $REPOS_DIR/specs/consensus-specs --branch dev"
echo "  python3 build.py --profile builder-specs   --repo-dir $REPOS_DIR/specs/builder-specs"
echo "  python3 build.py --profile relay-specs     --repo-dir $REPOS_DIR/specs/relay-specs"
echo "  python3 build.py --profile beacon-apis     --repo-dir $REPOS_DIR/specs/beacon-APIs"
echo "  python3 link.py"
