# Ethereum Specs Index

Deterministic extraction of every type, function, constant, and API endpoint
across the Ethereum spec ecosystem into a unified JSON schema.

Built for agents and humans: query the protocol programmatically, or render it
in an explorer UI.

## Quick start

```bash
# Build one spec index
python3 build.py --profile builder-specs --repo-dir /path/to/builder-specs

# Build all three (currently supported)
python3 build.py --profile consensus-specs --repo-dir /path/to/consensus-specs --branch dev
python3 build.py --profile builder-specs --repo-dir /path/to/builder-specs
python3 build.py --profile relay-specs --repo-dir /path/to/relay-specs
```

Output lands in `./indexes/`. Each spec produces one JSON file.

## Spec coverage

| Spec | Status | Items | Constants | Endpoints | Source format |
|------|--------|-------|-----------|-----------|---------------|
| consensus-specs | done | 528 | 218 | - | Markdown + Python |
| builder-specs | done | 16 | 2 | 5 | Markdown + OpenAPI |
| relay-specs | done | 12 | 0 | 5 | Markdown + OpenAPI |
| beacon-APIs | planned | | | | OpenAPI |
| execution-specs | planned | | | | Python source |
| execution-apis | planned | | | | OpenRPC |
| remote-signing-api | planned | | | | OpenAPI |

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

## Agent usage

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

# Where is this type defined? (source link)
spec["items"]["BuilderBid"]["forks"]["electra"]["github_url"]

# What depends on ExecutionPayloadHeader?
spec["_references"]["ExecutionPayloadHeader"]
```

## Architecture

```
build.py                    # Orchestrator
extractors/
  profiles.py               # Per-repo configuration (fork detection, domain rules, URLs)
  extract_markdown.py       # Generic markdown+Python parser
  extract_openapi.py        # OpenAPI endpoint extractor
  enrich.py                 # Structural enrichment (fields, signatures, refs, EIPs)
  fetch_examples.py         # SSZ test fixture fetcher (consensus-specs only)
indexes/                    # Generated JSON indexes (gitignored)
explorer/                   # UI (planned)
SCHEMA.md                   # JSON schema specification
```

### Adding a new spec repo

1. Add a `SpecProfile` in `extractors/profiles.py`
2. Run `python3 build.py --profile your-profile --repo-dir /path/to/repo`
3. That's it. The parser handles any repo that uses the Ethereum spec markdown
   conventions (headings + Python code blocks + constant tables).

For repos with different source formats (Python source, OpenRPC), write a new
extractor that outputs the same JSON schema.

## Dependencies

Python 3.8+. `pyyaml` for OpenAPI extraction.

```bash
pip install pyyaml
```

## What this is for

This project exists to make the Ethereum protocol machine-readable. The primary
consumers are AI agents that need to reason about spec changes, propose protocol
improvements with concrete implementation details, and trace data flow across
layer boundaries.

The secondary use case is an interactive explorer (like the existing Beacon Specs
Explorer) that renders any spec index into a navigable UI with cross-references,
fork diffs, and EIP filtering.
# inspectoor
