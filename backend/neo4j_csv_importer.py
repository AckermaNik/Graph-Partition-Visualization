"""To support restartability without requiring an auxiliary 
checkpoint database, both node and relationship imports are executed with MERGE.
In case of interruption, the import process can be safely re-executed from the beginning, 
while already imported entities are matched rather than duplicated. 
This approach favors robustness and implementation simplicity over maximum import throughput."""

#!/usr/bin/env python3
"""
Neo4j 5.x CSV Importer
======================

Imports custom node and relationship CSV files into Neo4j using the official
Neo4j Python driver.

CSV formats
-----------

Nodes CSV:
    node_id,label,json_properties,partID

Edges CSV:
    rel_ID,src_ID,dst_ID,rel_Type,rel_properties_json

Example node row:
    1,Person,"{""name"": ""Alice"", ""age"": 25}",0

Example edge row:
    10,1,2,KNOWS,"{""since"": 2020}"

Design choices
--------------
- Every imported node gets a common label :__Node
- Every imported node is identified by node_id
- The CSV label is also applied dynamically
- Relationships are imported by matching source and target nodes via node_id
- Both nodes and relationships use MERGE for safer re-runs after failures

Why MERGE for relationships too?
--------------------------------
This is slower than CREATE, but safer for your project:
- If import fails midway, you can just rerun it
- Already imported relationships are matched instead of duplicated
- No separate checkpoint database is needed

Usage
-----
python neo4j_csv_importer.py \
    --uri bolt://localhost:7687 \
    --user neo4j \
    --password your_password \
    --database neo4j \
    --nodes ./nodes \
    --edges ./edges \
    --verify-counts
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterator, List

from neo4j import GraphDatabase, Driver
from neo4j.exceptions import Neo4jError


# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)
logger = logging.getLogger("neo4j-importer")


# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

def normalize_empty(value: Any) -> Any:
    """Convert blank strings to None."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        return None if v == "" else v
    return value


def maybe_cast_scalar(value: str | None) -> Any:
    """
    Light scalar casting for IDs and partID.
    Keeps original string if it is not int/float/bool/null.
    """
    value = normalize_empty(value)
    if value is None:
        return None

    lower = value.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    if lower == "null":
        return None

    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value


def parse_json_object(raw: str | None, row_context: str) -> Dict[str, Any]:
    """
    Parse a JSON object field from CSV.
    Empty string -> {}
    """
    raw = normalize_empty(raw)
    if raw is None:
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{row_context}: invalid JSON ({exc})") from exc

    if parsed is None:
        return {}
    if not isinstance(parsed, dict):
        raise ValueError(f"{row_context}: JSON must be an object")
    return parsed


def quote_identifier(name: str) -> str:
    """
    Safely quote dynamic labels and relationship types for Cypher.
    """
    if not name or not name.strip():
        raise ValueError("Label/type cannot be empty")
    return f"`{name.replace('`', '``')}`"


def is_header_row(row: List[str], expected_first_col: str) -> bool:
    """Detect if first row is a CSV header."""
    if not row:
        return False
    return (row[0] or "").strip().lower() == expected_first_col.lower()


def collect_csv_files(path_str: str) -> List[Path]:
    """
    Accept either:
    - one CSV file
    - a directory with many CSV files
    """
    p = Path(path_str)

    if not p.exists():
        raise FileNotFoundError(f"Path does not exist: {p}")

    if p.is_file():
        if p.suffix.lower() != ".csv":
            raise ValueError(f"Expected a .csv file, got: {p}")
        return [p]

    files = sorted([f for f in p.iterdir() if f.is_file() and f.suffix.lower() == ".csv"])
    if not files:
        raise FileNotFoundError(f"No CSV files found in directory: {p}")
    return files


# -----------------------------------------------------------------------------
# CSV streaming and batching
# -----------------------------------------------------------------------------

def batched_grouped_rows(
    file_path: Path,
    mode: str,
    batch_size: int,
    delimiter: str = ",",
    encoding: str = "utf-8",
) -> Iterator[Dict[str, List[Dict[str, Any]]]]:
    """
    Read CSV row-by-row and emit grouped batches.

    For nodes:
        {label: [row_dict, ...]}

    For edges:
        {rel_type: [row_dict, ...]}
    """
    if mode not in {"nodes", "edges"}:
        raise ValueError("mode must be 'nodes' or 'edges'")

    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    total_in_batch = 0
    first_row_checked = False

    with file_path.open("r", encoding=encoding, newline="") as f:
        reader = csv.reader(f, delimiter=delimiter)

        for line_no, row in enumerate(reader, start=1):
            if not row or all((c or "").strip() == "" for c in row):
                continue

            if not first_row_checked:
                first_row_checked = True
                if mode == "nodes" and is_header_row(row, "node_id"):
                    logger.info("Skipping header in node file %s", file_path.name)
                    continue
                if mode == "edges" and is_header_row(row, "rel_ID"):
                    logger.info("Skipping header in edge file %s", file_path.name)
                    continue

            if mode == "nodes":
                if len(row) != 4:
                    raise ValueError(
                        f"{file_path}:{line_no}: expected 4 columns for node row, got {len(row)}"
                    )

                node_id_raw, label_raw, props_raw, part_id_raw = row

                node_id = maybe_cast_scalar(node_id_raw)
                label = normalize_empty(label_raw)
                part_id = maybe_cast_scalar(part_id_raw)
                props = parse_json_object(props_raw, f"{file_path}:{line_no}")

                if node_id is None:
                    raise ValueError(f"{file_path}:{line_no}: node_id is empty")
                if label is None:
                    raise ValueError(f"{file_path}:{line_no}: label is empty")

                groups[label].append({
                    "node_id": node_id,
                    "partID": part_id,
                    "props": props,
                })

            else:
                if len(row) != 5:
                    raise ValueError(
                        f"{file_path}:{line_no}: expected 5 columns for edge row, got {len(row)}"
                    )

                rel_id_raw, src_id_raw, dst_id_raw, rel_type_raw, props_raw = row

                rel_id = maybe_cast_scalar(rel_id_raw)
                src_id = maybe_cast_scalar(src_id_raw)
                dst_id = maybe_cast_scalar(dst_id_raw)
                rel_type = normalize_empty(rel_type_raw)
                props = parse_json_object(props_raw, f"{file_path}:{line_no}")

                if rel_id is None:
                    raise ValueError(f"{file_path}:{line_no}: rel_ID is empty")
                if src_id is None:
                    raise ValueError(f"{file_path}:{line_no}: src_ID is empty")
                if dst_id is None:
                    raise ValueError(f"{file_path}:{line_no}: dst_ID is empty")
                if rel_type is None:
                    raise ValueError(f"{file_path}:{line_no}: rel_Type is empty")

                groups[rel_type].append({
                    "rel_id": rel_id,
                    "src_id": src_id,
                    "dst_id": dst_id,
                    "props": props,
                })

            total_in_batch += 1

            if total_in_batch >= batch_size:
                yield groups
                groups = defaultdict(list)
                total_in_batch = 0

    if total_in_batch > 0:
        yield groups


# -----------------------------------------------------------------------------
# Neo4j schema and import queries
# -----------------------------------------------------------------------------

def create_schema(driver: Driver, database: str) -> None:
    """
    Create schema required for fast and safe imports.
    """
    statements = [
        """
        CREATE CONSTRAINT node_id_unique IF NOT EXISTS
        FOR (n:__Node)
        REQUIRE n.node_id IS UNIQUE
        """,
        """CREATE CONSTRAINT rel_id_unique IF NOT EXISTS
        FOR ()-[r]-()
        REQUIRE r.rel_id IS UNIQUE"""
        ,
        """
        CREATE INDEX node_partid_idx IF NOT EXISTS
        FOR (n:__Node)
        ON (n.partID)
        """
    ]

    with driver.session(database=database) as session:
        for stmt in statements:
            session.run(stmt).consume()

    logger.info("Schema created/verified successfully.")


def import_node_group(driver: Driver, database: str, label: str, rows: List[Dict[str, Any]]) -> None:
    """
    Import one group of nodes sharing the same label.
    """
    quoted_label = quote_identifier(label)

    cypher = f"""
    UNWIND $rows AS row
    MERGE (n:__Node {{node_id: row.node_id}})
    SET n.partID = row.partID
    SET n += row.props
    SET n:{quoted_label}
    """

    with driver.session(database=database) as session:
        session.execute_write(lambda tx: tx.run(cypher, rows=rows).consume())


def import_rel_group(driver: Driver, database: str, rel_type: str, rows: List[Dict[str, Any]]) -> None:
    """
    Import one group of relationships sharing the same relationship type.
    Uses MERGE for safer reruns after failures.
    """
    quoted_rel_type = quote_identifier(rel_type)

    cypher = f"""
    UNWIND $rows AS row
    MATCH (src:__Node {{node_id: row.src_id}})
    MATCH (dst:__Node {{node_id: row.dst_id}})
    MERGE (src)-[r:{quoted_rel_type} {{rel_id: row.rel_id}}]->(dst)
    SET r += row.props
    """

    with driver.session(database=database) as session:
        session.execute_write(lambda tx: tx.run(cypher, rows=rows).consume())


# -----------------------------------------------------------------------------
# Import orchestration
# -----------------------------------------------------------------------------

def import_node_files(
    driver: Driver,
    database: str,
    files: List[Path],
    batch_size: int,
    delimiter: str,
    encoding: str,
) -> int:
    total_rows = 0
    started = time.perf_counter()

    for file_path in files:
        file_rows = 0
        logger.info("Importing node file: %s", file_path)

        for grouped_batch in batched_grouped_rows(
            file_path=file_path,
            mode="nodes",
            batch_size=batch_size,
            delimiter=delimiter,
            encoding=encoding,
        ):
            for label, rows in grouped_batch.items():
                if not rows:
                    continue
                import_node_group(driver, database, label, rows)
                total_rows += len(rows)
                file_rows += len(rows)

                logger.info(
                    "Nodes progress | file=%s | label=%s | batch=%d | total=%d",
                    file_path.name,
                    label,
                    len(rows),
                    total_rows,
                )

        logger.info("Finished node file %s | rows=%d", file_path.name, file_rows)

    elapsed = time.perf_counter() - started
    logger.info("All node imports completed | total=%d | time=%.2fs", total_rows, elapsed)
    return total_rows


def import_edge_files(
    driver: Driver,
    database: str,
    files: List[Path],
    batch_size: int,
    delimiter: str,
    encoding: str,
) -> int:
    total_rows = 0
    started = time.perf_counter()

    for file_path in files:
        file_rows = 0
        logger.info("Importing edge file: %s", file_path)

        for grouped_batch in batched_grouped_rows(
            file_path=file_path,
            mode="edges",
            batch_size=batch_size,
            delimiter=delimiter,
            encoding=encoding,
        ):
            for rel_type, rows in grouped_batch.items():
                if not rows:
                    continue
                import_rel_group(driver, database, rel_type, rows)
                total_rows += len(rows)
                file_rows += len(rows)

                logger.info(
                    "Edges progress | file=%s | type=%s | batch=%d | total=%d",
                    file_path.name,
                    rel_type,
                    len(rows),
                    total_rows,
                )

        logger.info("Finished edge file %s | rows=%d", file_path.name, file_rows)

    elapsed = time.perf_counter() - started
    logger.info("All edge imports completed | total=%d | time=%.2fs", total_rows, elapsed)
    return total_rows


def verify_counts(driver: Driver, database: str) -> None:
    """
    Print final node and relationship counts from Neo4j.
    """
    queries = {
        "nodes": "MATCH (n:__Node) RETURN count(n) AS c",
        "relationships": "MATCH ()-[r]->() RETURN count(r) AS c",
    }

    with driver.session(database=database) as session:
        for name, query in queries.items():
            record = session.run(query).single()
            logger.info("Database %s count: %s", name, record["c"])


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import custom CSV graph data into Neo4j 5.x")

    parser.add_argument("--uri", required=True, help="Neo4j URI, e.g. bolt://localhost:7687")
    parser.add_argument("--user", required=True, help="Neo4j username")
    parser.add_argument("--password", required=True, help="Neo4j password")
    parser.add_argument("--database", default="neo4j", help="Target database name")

    parser.add_argument(
        "--nodes",
        required=True,
        help="Path to node CSV file or directory containing node CSV files"
    )
    parser.add_argument(
        "--edges",
        required=True,
        help="Path to edge CSV file or directory containing edge CSV files"
    )

    parser.add_argument(
        "--node-batch-size",
        type=int,
        default=5000,
        help="Batch size for node import (default: 5000)"
    )
    parser.add_argument(
        "--edge-batch-size",
        type=int,
        default=10000,
        help="Batch size for edge import (default: 10000)"
    )

    parser.add_argument("--delimiter", default=",", help="CSV delimiter (default: ,)")
    parser.add_argument("--encoding", default="utf-8", help="CSV encoding (default: utf-8)")
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Skip schema creation"
    )
    parser.add_argument(
        "--verify-counts",
        action="store_true",
        help="Print final node/relationship counts after import"
    )

    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    try:
        node_files = collect_csv_files(args.nodes)
        edge_files = collect_csv_files(args.edges)

        logger.info("Found %d node file(s)", len(node_files))
        logger.info("Found %d edge file(s)", len(edge_files))

        driver = GraphDatabase.driver(
            args.uri,
            auth=(args.user, args.password),
            max_connection_pool_size=50,
            connection_timeout=30,
            keep_alive=True,
        )

        try:
            driver.verify_connectivity()
            logger.info("Connected successfully to Neo4j.")

            if not args.skip_schema:
                create_schema(driver, args.database)

            logger.info("Starting node import phase...")
            import_node_files(
                driver=driver,
                database=args.database,
                files=node_files,
                batch_size=args.node_batch_size,
                delimiter=args.delimiter,
                encoding=args.encoding,
            )

            logger.info("Starting edge import phase...")
            import_edge_files(
                driver=driver,
                database=args.database,
                files=edge_files,
                batch_size=args.edge_batch_size,
                delimiter=args.delimiter,
                encoding=args.encoding,
            )

            if args.verify_counts:
                verify_counts(driver, args.database)

            logger.info("Import completed successfully.")
            return 0

        finally:
            driver.close()

    except (FileNotFoundError, ValueError, Neo4jError) as exc:
        logger.exception("Import failed: %s", exc)
        return 1
    except Exception as exc:
        logger.exception("Unexpected error: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())