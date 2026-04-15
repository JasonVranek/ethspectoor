# Ethspectoor MCP Skill

A structured guide for AI agents using the Ethspectoor MCP server to navigate
Ethereum specification data. Covers all tools, common workflows, and gotchas.

## Mental Model

Ethereum's protocol is defined across **7 spec repos**, each covering a different
layer or interface:

| Spec | What it covers | Example types |
|------|---------------|---------------|
| `consensus-specs` | Beacon chain, fork choice, validator duties | `BeaconState`, `process_block`, `Attestation` |
| `execution-specs` | EVM, state transitions, transaction processing | `Transaction`, `Block`, `vm instructions` |
| `execution-apis` | JSON-RPC API between EL and CL (Engine API) | `eth_getBlockByNumber`, `engine_newPayload` |
| `beacon-apis` | REST API for beacon node consumers | `getBlock`, `getStateValidators` |
| `builder-specs` | MEV-Boost builder API (proposer <-> builder) | `BuilderBid`, `SignedBuilderBid` |
| `relay-specs` | Relay API (builder <-> relay <-> proposer) | `SubmitBlockRequest` |
| `remote-signing-api` | Remote validator signing (e.g. Web3Signer) | `SigningRequest`, `AggregationSlot` |

**Every type exists at a specific fork.** Forks are version milestones. Consensus
layer forks: `phase0` -> `altair` -> `bellatrix` -> `capella` -> `deneb` ->
`electra` -> `fulu` -> `gloas` -> `heze`. Execution layer forks use different
names: `frontier` -> ... -> `paris` -> `shanghai` -> `cancun` -> `prague` ->
`osaka` -> `amsterdam`. Types can be added, modified, or removed at each fork.

**Types are the atoms.** The index contains:
- **Containers/classes** -- data structures with typed fields (e.g. `BeaconBlockBody`)
- **Functions** -- spec functions with full source code (e.g. `process_attestation`)
- **Constants** -- named values with their numeric/hex values
- **Endpoints** -- REST and JSON-RPC API operations with parameters and response types

**Cross-spec references** connect the layers. A type in `builder-specs` may reference
a container defined in `consensus-specs`. The `trace_type` tool reveals these links.

## Tools

### Orientation

**`list_specs`** -- No parameters. Returns all indexed specs with item counts,
endpoint counts, and available forks. Call this first in any session to understand
what data is available.

### Lookup

**`lookup_type(name, fork?, spec?)`** -- Get the full definition of a type or
function. Returns fields, code, source link, references, and EIP associations.
Supports fuzzy matching but prefers exact names. Omit `fork` for the latest
version. Omit `spec` to search across all specs.

When to use: You know (or approximately know) the name of a type and want its
definition, fields, or source code.

**`lookup_endpoint(query)`** -- Search API endpoints by path fragment, operation
ID, or keyword. Returns parameters, response schemas, SSZ support, and fork
variants.

When to use: You need to understand an API surface -- what parameters an endpoint
takes, what it returns, which forks support it.

### Discovery

**`search(query, limit?)`** -- Fuzzy search across all items, constants, type
aliases, and endpoints. Returns categorized results. Good for exploratory queries
when you don't know exact names.

When to use: You're looking for something but don't know the exact name. Use broad
terms like "blob", "withdrawal", "attestation". Then follow up with `lookup_type`
on specific results.

**`what_changed(fork, spec?)`** -- List everything added or modified in a specific
fork. Includes EIP associations. Omit `spec` to see changes across all specs.

When to use: Understanding what a fork upgrade introduces. Reviewing the scope of
a hard fork. Finding which EIPs landed in which fork.

### Analysis

**`diff_type(name, from_fork, to_fork)`** -- Compare a type between two forks.
Shows field additions, removals, and code changes side by side.

When to use: Understanding how a specific type evolved. Checking whether a field
was added or removed in a particular upgrade.

**`trace_type(name)`** -- Trace a type across spec boundaries. Shows where it's
defined, who references it, and cross-spec usage.

When to use: Understanding data flow between protocol layers. Checking whether a
consensus-specs type appears in builder-specs or beacon-apis. Finding all consumers
of a shared type.

### PR Analysis

**`list_prs(spec?)`** -- List indexed PR overlays with number, title, author, and
summary of changes.

**`index_pr(spec, pr)`** -- Index a GitHub PR as a virtual fork. Fetches the PR
branch, extracts changes, and diffs against mainline. After indexing, the PR is
queryable using `pr-NNNN` syntax in other tools:
- `lookup_type(name, fork="pr-5094")` -- see the PR's version of a type
- `diff_type(name, from_fork="electra", to_fork="pr-5094")` -- diff against mainline
- `what_changed(fork="pr-5094")` -- see everything the PR changes

When to use: Reviewing spec PRs before they merge. Understanding the blast radius
of a proposed protocol change.

### Maintenance

**`reindex(specs?)`** -- Rebuild spec indexes from source repos. Use after pulling
new commits or when results seem stale. Omit `specs` to rebuild everything.

## Workflow Patterns

### "What changed in the latest fork?"

```
1. list_specs                              # see available forks
2. what_changed(fork="fulu")               # everything new/modified in fulu
3. lookup_type(name="SomeNewType")         # drill into specific items
4. diff_type(name="BeaconState",           # see how a type changed
             from_fork="electra",
             to_fork="fulu")
```

### "How does type X flow between protocol layers?"

```
1. lookup_type(name="ExecutionPayload")    # get the definition
2. trace_type(name="ExecutionPayload")     # see cross-spec references
3. lookup_endpoint(query="payload")        # find API endpoints using it
```

### "Review a spec PR"

```
1. index_pr(spec="consensus-specs", pr=5094)     # index the PR
2. what_changed(fork="pr-5094")                   # see all changes
3. diff_type(name="BeaconBlockBody",              # diff a modified type
             from_fork="gloas",
             to_fork="pr-5094")
4. lookup_type(name="new_function",               # inspect new additions
               fork="pr-5094")
```

### "Find the API endpoint for X"

```
1. search(query="validator status")        # broad discovery
2. lookup_endpoint(query="validators")     # find the REST endpoint
3. lookup_type(name="ValidatorResponse")   # inspect the response type
```

### "Understand a specific EIP's changes"

```
1. what_changed(fork="electra")            # see all changes with EIP tags
2. search(query="7549")                    # search by EIP number
3. diff_type(name="Attestation",           # diff the affected types
             from_fork="deneb",
             to_fork="electra")
```

## Tips

- **Start broad, then narrow.** Use `search` or `what_changed` for discovery,
  then `lookup_type` and `diff_type` for details.
- **Fork names differ between CL and EL.** Consensus uses `deneb`/`electra`/`fulu`.
  Execution uses `cancun`/`prague`/`osaka`. Don't mix them -- each spec has its own
  fork timeline. Use `list_specs` to see what forks are available per spec.
- **`lookup_type` is exact-ish, `search` is fuzzy.** If `lookup_type` returns
  nothing, try `search` to find the right name. Types are case-sensitive
  (`BeaconState` not `beaconstate`).
- **Omit optional parameters for broader results.** Leaving out `spec` searches
  all specs. Leaving out `fork` returns the latest version.
- **PR forks use `pr-NNNN` syntax.** After `index_pr`, the PR becomes a virtual
  fork usable in `lookup_type`, `diff_type`, and `what_changed`.
- **Cross-spec tracing is powerful.** `trace_type` reveals how data flows from
  consensus-specs through builder-specs to beacon-apis. Use it before assuming a
  type only lives in one spec.

## MCP Configuration

To connect the Ethspectoor to your MCP client:

```json
{
  "mcpServers": {
    "ethspectoor": {
      "command": "uv",
      "args": [
        "run", "--with", "mcp", "--with", "pyyaml",
        "python3", "/path/to/ethspectoor/server.py",
        "--catalog", "/path/to/ethspectoor/docs/catalog.json"
      ]
    }
  }
}
```

Replace `/path/to/ethspectoor` with the actual path to your cloned repo.
The server reads the pre-built catalog and serves it over stdio transport.
