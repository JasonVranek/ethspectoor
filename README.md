# The Inspectoor

Deterministic extraction of every type, function, constant, and API endpoint
across the Ethereum spec ecosystem into a unified JSON schema. Queryable as
an MCP server.

Built for agents and humans: query the protocol programmatically, render it
in an explorer UI, or plug it into any MCP-compatible tool.

## Setup

```bash
# 1. Install dependencies
pip install pyyaml mcp

# 2. Fetch all Ethereum spec repos
./fetch_repos.sh

# 3. Build indexes
python3 build.py --profile consensus-specs --repo-dir ./repos/specs/consensus-specs --branch dev
python3 build.py --profile builder-specs   --repo-dir ./repos/specs/builder-specs
python3 build.py --profile relay-specs     --repo-dir ./repos/specs/relay-specs
python3 build.py --profile beacon-apis     --repo-dir ./repos/specs/beacon-APIs

# 4. Link cross-spec references
python3 link.py

# 5. (Optional) Start the MCP server
python3 server.py --indexes-dir ./indexes --repos-dir ./repos
```

### Updating

Pull the latest spec changes and rebuild:

```bash
./fetch_repos.sh --update
# Then re-run the build commands above, or use the MCP reindex tool
```

## MCP Server

The Inspectoor runs as an MCP server, giving any compatible agent structured
access to Ethereum spec data without loading raw JSON into context.

### Tools

| Tool | Description |
|------|-------------|
| `list_specs` | What specs are loaded, item counts, available forks |
| `lookup_type` | Look up a type/function by name. Returns fields, code, source link, references, EIPs. Fuzzy matching. |
| `lookup_endpoint` | Search API endpoints by path, operation, or keyword. Shows params, SSZ support, fork variants. |
| `what_changed` | What was added or modified in a fork, with EIP associations. |
| `trace_type` | Trace a type across spec boundaries. Where it's defined, who uses it, cross-spec references. |
| `search` | Fuzzy search across all items, constants, type aliases, and endpoints. |
| `diff_type` | Compare a type between two forks. Field additions, removals, code changes. |
| `reindex` | Rebuild indexes from source repos and reload. Requires `--repos-dir`. |

### Configuration

#### Hermes Agent

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  inspectoor:
    command: "python3"
    args:
      - "/path/to/inspectoor/server.py"
      - "--indexes-dir"
      - "/path/to/inspectoor/indexes"
      - "--repos-dir"
      - "/path/to/inspectoor/repos"
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "inspectoor": {
      "command": "python3",
      "args": [
        "/path/to/inspectoor/server.py",
        "--indexes-dir", "/path/to/inspectoor/indexes",
        "--repos-dir", "/path/to/inspectoor/repos"
      ]
    }
  }
}
```

#### Any MCP client (stdio transport)

```bash
python3 server.py --indexes-dir ./indexes --repos-dir ./repos
```

The `--repos-dir` flag enables the `reindex` tool. Omit it for a read-only
server that only serves pre-built indexes.

### Example queries

An agent with the Inspectoor MCP server can answer questions like:

- "What fields does BuilderBid have at Electra?"
  -> `lookup_type(name="BuilderBid", fork="electra")`

- "What changed in the builder spec at Deneb?"
  -> `what_changed(fork="deneb", spec="builder-specs")`

- "What endpoints support SSZ?"
  -> `lookup_endpoint(query="header")` then check `ssz_support`

- "Where does ExecutionPayloadHeader come from and who depends on it?"
  -> `trace_type(name="ExecutionPayloadHeader")`

- "How did BuilderBid change between Deneb and Electra?"
  -> `diff_type(name="BuilderBid", from_fork="deneb", to_fork="electra")`

- "Rebuild the builder-specs index after a spec update"
  -> `reindex(specs=["builder-specs"])`

## Spec coverage

| Spec | Status | Items | Constants | Endpoints | Source format |
|------|--------|-------|-----------|-----------|---------------|
| consensus-specs | done | 528 | 218 | - | Markdown + Python |
| builder-specs | done | 16 | 2 | 5 | Markdown + OpenAPI |
| relay-specs | done | 12 | - | 5 | Markdown + OpenAPI |
| beacon-APIs | done | 77 | - | 84 | OpenAPI |
| execution-specs | planned | | | | Python source |
| execution-apis | planned | | | | OpenRPC |
| remote-signing-api | planned | | | | OpenAPI |

Cross-spec linking: 129 types in the unified type map, 78 cross-boundary
references across 4 spec boundaries.

## Schema

See [SCHEMA.md](SCHEMA.md) for the full JSON schema specification.

Every index file contains:
- `items` -- types, functions, enums tracked across forks
- `constants` -- named values across forks
- `type_aliases` -- SSZ type mappings
- `endpoints` -- API routes with parameters, responses, content negotiation
- `_references` -- reverse dependency graph
- `_field_index` -- field-level tracking across forks
- `_eip_index` -- what each EIP touches
- `_type_map` -- cross-spec type resolution

The linker produces `_cross_refs.json` with:
- `type_map` -- unified type map across all specs (canonical source wins)
- `cross_refs` -- every reference that crosses a spec boundary
- `boundaries` -- references grouped by spec pair

## Direct JSON usage

```python
import json

with open("indexes/builder-specs_index.json") as f:
    spec = json.load(f)

# What fields does BuilderBid have at Electra?
spec["items"]["BuilderBid"]["forks"]["electra"]["fields"]

# What changed in Electra?
spec["fork_summary"]["electra"]

# What endpoints support SSZ?
[ep["path"] for ep in spec["endpoints"].values()
 if ep["content_negotiation"]["ssz_support"]]

# Source link for verification
spec["items"]["BuilderBid"]["forks"]["electra"]["github_url"]

# Cross-spec type resolution
with open("indexes/_cross_refs.json") as f:
    xref = json.load(f)
xref["type_map"]["ExecutionPayloadHeader"]
# -> {"source": "ethereum/consensus-specs", "introduced": "bellatrix", "kind": "class"}
```

## Architecture

```
build.py                    # Build orchestrator
link.py                     # Cross-spec linker
server.py                   # MCP server (8 tools)
fetch_repos.sh              # Clone/update all spec repos
extractors/
  profiles.py               # Per-repo configuration
  extract_markdown.py       # Generic markdown+Python parser
  extract_openapi.py        # OpenAPI endpoint + type schema extractor
  enrich.py                 # Structural enrichment (fields, sigs, refs, EIPs)
  fetch_examples.py         # SSZ test fixture fetcher (consensus-specs only)
indexes/                    # Generated JSON indexes (gitignored)
SCHEMA.md                   # JSON schema specification
```

### Adding a new spec repo

1. Add a `SpecProfile` in `extractors/profiles.py`
2. Run `python3 build.py --profile your-profile --repo-dir /path/to/repo`
3. Run `python3 link.py` to update cross-spec references

For repos with different source formats (Python source, OpenRPC), write a new
extractor that outputs the same JSON schema.

## Dependencies

- Python 3.8+
- `pyyaml` -- OpenAPI extraction
- `mcp` -- MCP server (optional, only needed for server.py)
