# The Inspectoor -- Unified Schema

## Purpose

A single intermediate JSON format that captures the data model and API surface
of every Ethereum spec repo. Designed to be:

1. **Agent-readable** -- structured enough that an LLM can answer questions about
   the protocol without reading raw markdown or YAML
2. **UI-renderable** -- a single explorer frontend can consume any spec index
   that conforms to this schema
3. **Cross-linkable** -- types referenced across spec boundaries carry enough
   metadata to resolve to their source

## Spec Sources

Each spec repo produces one index file. The schema is the same across all.

| Source Repo | Source Format | Content |
|---|---|---|
| `consensus-specs` | Markdown + Python blocks | CL state machine: types, functions, constants |
| `builder-specs` | Markdown + Python blocks + OpenAPI | Builder API: types, endpoints |
| `relay-specs` | Markdown + Python blocks + OpenAPI | Relay API: types, endpoints |
| `beacon-APIs` | OpenAPI YAML | Beacon node REST API: endpoints, types |
| `execution-specs` | Python source | EL state machine: types, functions, opcodes |
| `execution-apis` | OpenRPC YAML | EL JSON-RPC API: methods, schemas |
| `remote-signing-api` | OpenAPI YAML | Remote signer API: endpoints, types |

## Top-Level Structure

```json
{
  "_meta": {
    "schema_version": "1.0.0",
    "source": "ethereum/builder-specs",
    "source_format": "markdown+openapi",
    "branch": "main",
    "fork_order": ["bellatrix", "capella", "deneb", "electra", "fulu"],
    "features": [],
    "files_processed": [...],
    "total_items": 16,
    "total_constants": 2,
    "total_type_aliases": 0,
    "total_endpoints": 5
  },
  "items": { ... },
  "constants": { ... },
  "type_aliases": { ... },
  "endpoints": { ... },
  "domains": { ... },
  "fork_summary": { ... },
  "_references": { ... },
  "_field_index": { ... },
  "_eip_index": { ... },
  "_type_map": { ... }
}
```

## Items

An "item" is a named definition tracked across forks: a container/class,
a function, an enum, or a dataclass.

### Item Kinds

| Kind | Description | Has fields | Has params | Has return_type |
|---|---|---|---|---|
| `class` | SSZ container | yes | no | no |
| `dataclass` | Python dataclass | yes | no | no |
| `def` | Function/helper | no | yes | yes |
| `enum` | Enumeration | yes (variants) | no | no |

Each item has `forks` keyed by fork name. Each fork entry includes:
- `code` -- full source code
- `file` -- source file path (relative to repo)
- `github_url` -- permalink to source
- `fields` -- container fields with types (enriched)
- `params` / `return_type` -- function signatures (enriched)
- `references` -- other items this code references
- `eips` -- EIP numbers associated with changes
- `prose` -- spec prose documentation preceding the code
- `is_new` / `is_modified` -- change status at this fork
- `inline_comments` -- `[New in X]` and `[Modified in X]` markers

## Constants

Named values tracked across forks. Each constant entry includes the value,
section, category (constant/preset/configuration), source file, and GitHub URL.

## Type Aliases

SSZ type mappings (e.g., `Slot = uint64`). Each alias includes the SSZ
equivalent type, description, and source location.

## Endpoints

API routes from OpenAPI/OpenRPC specs. Each endpoint includes:
- `method` / `path` -- HTTP method and URL template
- `parameters` -- path, query, header params with types
- `request_body` -- POST/PUT body schema
- `responses` -- status code -> description + schema
- `fork_versioned` -- whether response varies by fork
- `fork_variants` -- fork -> specific response type
- `content_negotiation` -- SSZ support, content types
- `examples` -- example values from the spec
- `errors` -- error response details
- `source_file` / `github_url` -- source traceability

## Cross-Reference Indexes

### `_references` -- Reverse dependency graph
Maps type names to the items that reference them.

### `_field_index` -- Field-level tracking
Tracks individual container fields across forks with type changes.

### `_eip_index` -- EIP impact map
Maps EIP numbers to affected items and their change type (new/modified).

### `_type_map` -- Cross-spec type resolution
Maps type names to their canonical source spec and introduction fork.

## Source Traceability

Every item, constant, type alias, and endpoint carries a `github_url` field
that links back to the exact line in the source repo. The `file` field preserves
the full path relative to the repo root.

## Cross-Spec Linking

The `link.py` script produces `_cross_refs.json` with:
- `type_map` -- unified type map across all specs (canonical source wins)
- `cross_refs` -- every reference that crosses a spec boundary
- `boundaries` -- references grouped by spec pair (e.g., "builder-specs -> consensus-specs")

## Design Principles

1. **Each spec repo produces its own index file.** No monolithic extraction.
   Cross-spec linking happens at query time via `_type_map` and `_cross_refs.json`.

2. **Items and endpoints are separate top-level collections.** An item is a
   type/function/constant. An endpoint is an API route. They reference each
   other by name.

3. **Fork-first organization.** Every definition is keyed by fork. This enables
   "what changed in fork X" queries trivially.

4. **Enrichment is a separate pass.** Raw extraction produces items with code.
   Enrichment adds fields, signatures, references, EIP tags.

5. **Source format is abstracted away.** Whether the source is markdown+Python,
   real Python source, or OpenAPI YAML, the output schema is identical.

## Agent Usage Patterns

```python
# What types does BuilderBid reference?
data["items"]["BuilderBid"]["forks"]["electra"]["references"]

# What changed in Electra?
data["fork_summary"]["electra"]

# What endpoints return a SignedBuilderBid?
[ep for ep in data["endpoints"].values()
 if any(r.get("schema_ref") == "SignedBuilderBid"
        for r in ep["responses"].values())]

# What EIPs affect the builder spec?
data["_eip_index"]

# Where does ExecutionPayloadHeader come from?
data["_type_map"]["ExecutionPayloadHeader"]["source"]

# What are the fields of BuilderBid at Electra?
data["items"]["BuilderBid"]["forks"]["electra"]["fields"]

# GET /eth/v1/builder/header params?
data["endpoints"]["GET /eth/v1/builder/header/{slot}/{parent_hash}/{pubkey}"]["parameters"]

# What types flow across the builder-specs / consensus-specs boundary?
xref["boundaries"]["builder-specs -> consensus-specs"]
```
