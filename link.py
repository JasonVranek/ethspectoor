#!/usr/bin/env python3
"""
Cross-spec linker. Loads all spec indexes and builds a unified type map
that resolves type references across spec boundaries.

Usage:
    python3 link.py [--indexes-dir ./indexes]

Outputs: indexes/_cross_refs.json
"""

import argparse
import json
import os
import sys
from pathlib import Path
from collections import defaultdict


def load_indexes(indexes_dir: str) -> dict:
    indexes = {}
    for path in sorted(Path(indexes_dir).glob("*_index.json")):
        with open(path) as f:
            data = json.load(f)
        name = path.stem.replace("_index", "")
        indexes[name] = data
        print(f"  Loaded {name}: {data['_meta']['total_items']} items, "
              f"{len(data.get('endpoints', {}))} endpoints", file=sys.stderr)
    return indexes


def build_unified_type_map(indexes: dict) -> dict:
    priority = {
        "ethereum/consensus-specs": 1,
        "ethereum/execution-specs": 2,
        "ethereum/builder-specs": 3,
        "flashbots/relay-specs": 4,
        "ethereum/beacon-APIs": 5,
        "ethereum/execution-apis": 6,
        "ethereum/remote-signing-api": 7,
    }

    unified = {}
    for spec_name, data in indexes.items():
        type_map = data.get("_type_map", {})
        for type_name, info in type_map.items():
            source = info["source"]
            if type_name not in unified:
                unified[type_name] = info
            else:
                existing_priority = priority.get(unified[type_name]["source"], 99)
                new_priority = priority.get(source, 99)
                if new_priority < existing_priority:
                    unified[type_name] = info

    return unified


def find_cross_spec_references(indexes: dict, unified_type_map: dict) -> dict:
    cross_refs = {}

    for spec_name, data in indexes.items():
        spec_source = data["_meta"]["source"]

        for item_name, item in data.get("items", {}).items():
            for fork, defn in item.get("forks", {}).items():
                refs = defn.get("references", [])
                for ref_name in refs:
                    if ref_name in unified_type_map:
                        ref_source = unified_type_map[ref_name]["source"]
                        if ref_source != spec_source:
                            # Skip if the referring spec also defines this type
                            # (indicates independent definitions, not cross-spec dependency)
                            if ref_name in data.get("items", {}):
                                continue
                            key = f"{spec_name}:{item_name} -> {ref_name}"
                            if key not in cross_refs:
                                cross_refs[key] = {
                                    "from_spec": spec_name,
                                    "from_item": item_name,
                                    "to_spec": ref_source,
                                    "to_type": ref_name,
                                    "forks": [],
                                }
                            if fork not in cross_refs[key]["forks"]:
                                cross_refs[key]["forks"].append(fork)

    return cross_refs


def build_boundary_map(cross_refs: dict) -> dict:
    boundaries = defaultdict(list)
    for ref in cross_refs.values():
        from_name = ref["from_spec"]
        to_name = ref["to_spec"].split("/")[-1]
        boundary_key = f"{from_name} -> {to_name}"
        boundaries[boundary_key].append({
            "from": ref["from_item"],
            "to": ref["to_type"],
            "forks": ref["forks"],
        })
    return dict(boundaries)


def main():
    parser = argparse.ArgumentParser(description="Cross-spec linker")
    parser.add_argument("--indexes-dir", default="./indexes")
    args = parser.parse_args()

    print("Loading indexes...", file=sys.stderr)
    indexes = load_indexes(args.indexes_dir)

    if not indexes:
        print("No indexes found.", file=sys.stderr)
        sys.exit(1)

    print(f"\nBuilding unified type map...", file=sys.stderr)
    unified_type_map = build_unified_type_map(indexes)
    print(f"  {len(unified_type_map)} types across {len(indexes)} specs", file=sys.stderr)

    print(f"\nFinding cross-spec references...", file=sys.stderr)
    cross_refs = find_cross_spec_references(indexes, unified_type_map)
    print(f"  {len(cross_refs)} cross-spec references found", file=sys.stderr)

    print(f"\nBuilding boundary map...", file=sys.stderr)
    boundaries = build_boundary_map(cross_refs)
    for boundary, refs in sorted(boundaries.items()):
        print(f"  {boundary}: {len(refs)} type references", file=sys.stderr)

    output = {
        "_meta": {
            "specs_linked": list(indexes.keys()),
            "total_types": len(unified_type_map),
            "total_cross_refs": len(cross_refs),
        },
        "type_map": unified_type_map,
        "cross_refs": cross_refs,
        "boundaries": boundaries,
    }

    output_path = os.path.join(args.indexes_dir, "_cross_refs.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWritten to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
