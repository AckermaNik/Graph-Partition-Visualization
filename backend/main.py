import re
import secrets
import time
import os
from fastapi import FastAPI, HTTPException
from neo4j import AsyncGraphDatabase, AsyncDriver,Query
from neo4j.graph import Node
from fastapi.middleware.cors import CORSMiddleware
import neo4j
import io
import csv
import hashlib
import json
import traceback
from typing import Any
import redis.asyncio as redis
from redis.exceptions import RedisError
from starlette.responses import StreamingResponse
from typing import Any, Dict,Set
import shutil
import copy
from .schema import compute_schema
from .utilities import ConnectionPayload,CypherRequest,SchemaRequest,SavedQueryRequest,DeleteSavedQueryRequest
from typing import Dict, Tuple
from .shaping import shape_result
from .coloring import build_label_color_map
import asyncio

app = FastAPI()

#which browsers are allowed to call my API from another origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], #frontend dev server -Vite
    allow_credentials=False, #Allows cookies, authentication headers, or sessions to be sent with requests
    allow_methods=["*"], #Which HTTP methods are allowed.
    allow_headers=["*"], #Which request headers are allowed
)
########################################################################
# For a more permanenent and fast caching, using RAM that :
# 1) Works across multiple processes and servers
# 2) Survives app/server restarts
# Use Redis with key-value stores: pip install fastapi uvicorn redis
# import redis
# r = redis.Redis(host="localhost", port=6379, decode_responses=True)
# r.set(key, value) 
# value = r.get(key)


COLORS_CACHE: dict[str, dict[str, str]] = {}
PARTITION_IDS_CACHE: dict[str, list] = {}

SCHEMA_CACHE: dict[str, dict[str, Any]] = {}
CLUSTERS_CACHE: dict[str, dict[str, Any]] = {}
CLUSTERS_STATS_CACHE: dict[str, dict[str, Any]] = {}
PARTITION_ID_CACHE: dict[str, str] = {}
DATABASE_URL_CACHE: dict[str, str] = {}
DATABASE_NAME_CACHE: dict[str, str] = {}
SAVED_QUERY_LIMIT = 50
REDIS_URL = os.getenv("REDIS_URL")
REDIS_CLIENT = redis.from_url(REDIS_URL, decode_responses=True)
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() in {"1", "true", "yes"}
DEMO_NEO4J_URI = os.getenv("NEO4J_URI")
DEMO_NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
DEMO_NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

# conn_id -> (driver, last_used)
DRIVER_CACHE: Dict[str, Tuple[AsyncDriver, float]] = {}
# conn_id -> background cache warm-up tasks
PARTITION_WARMUP_TASKS: dict[str, asyncio.Task] = {}
SCHEMA_WARMUP_TASKS: dict[str, asyncio.Task] = {}
CACHE_TTL_S = 60 * 60 * 8  # 8 hours idle timeout

@app.get("/")
async def health_check():
    return {"status": "ok"}

@app.head("/")
async def health_check():
    return {"status": "Server is awake and running!"}

def database_saved_query_key(conn_id: str) -> str:
    database_url = DATABASE_URL_CACHE.get(conn_id)
    database_name = DATABASE_NAME_CACHE.get(conn_id)

    if not database_url or not database_name:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    raw_key = f"{database_url.strip()}::{database_name.strip()}"
    return f"saved_queries:{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()}"


def saved_query_meta_key(redis_key: str) -> str:
    """
    Stores readable database metadata under a companion ':meta' key in Redis.
    
    Since 'redis_key' is an irreversible SHA-256 hash, this serves as a 
    'decoder ring' so admins can see which real database the hashed query 
    list actually belongs to when inspecting Redis.
    """
    return f"{redis_key}:meta"


def saved_query_id(query: str) -> str:
    return hashlib.sha256(query.encode("utf-8")).hexdigest()


def parse_saved_query(raw: str) -> dict[str, Any] | None:
    try:
        item = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not isinstance(item, dict):
        return None

    return item


async def read_saved_queries_from_redis(redis_key: str) -> list[dict[str, Any]]:
    raw_queries = await REDIS_CLIENT.lrange(redis_key, 0, SAVED_QUERY_LIMIT - 1)
    return [
        item
        for item in (parse_saved_query(raw) for raw in raw_queries)
        if item is not None
    ]


async def remember_saved_query_database(redis_key: str, conn_id: str) -> None:
    """
    Syncs the database connection metadata to Redis before fetching queries.
    Ensures subsequent read operations have access to the correct connection context.
    """
    await REDIS_CLIENT.hset(
        saved_query_meta_key(redis_key),
        mapping={
            "database_url": DATABASE_URL_CACHE[conn_id],
            "database_name": DATABASE_NAME_CACHE[conn_id],
        },
    )


def cache_key(con_id: str) -> str:
    return hashlib.sha256(con_id.encode("utf-8")).hexdigest()


def _cancel_warmup_tasks(conn_id: str) -> None:
    """Cancel warm-ups that have not completed for this connection."""
    for task_map in (
        PARTITION_WARMUP_TASKS,
        SCHEMA_WARMUP_TASKS,
    ):
        task = task_map.pop(conn_id, None)
        if task and not task.done():
            task.cancel()


def invalidate_connection_caches(conn_id: str) -> None:
    """Remove database-derived caches so the next request reads fresh data."""
    _cancel_warmup_tasks(conn_id)

    key = cache_key(conn_id)
    
    SCHEMA_CACHE.pop(key, None)
    CLUSTERS_CACHE.pop(key, None)
    CLUSTERS_STATS_CACHE.pop(key, None)
    PARTITION_IDS_CACHE.pop(conn_id, None)
           
def _evict_expired():
    """Sync — only dict ops. Schedules async driver.close() as a background task."""
    now = time.time()
    expired = [cid for cid, (drv, last) in DRIVER_CACHE.items() if now - last > CACHE_TTL_S]
    for cid in expired:
        drv, last = DRIVER_CACHE.pop(cid)
        COLORS_CACHE.pop(cid, None)
        PARTITION_IDS_CACHE.pop(cid, None)
        _cancel_warmup_tasks(cid)
        print(f"DEBUG: Connection {cid} is {now - last:.2f} seconds old (TTL: {CACHE_TTL_S})")
        asyncio.create_task(_close_driver(drv))

async def _close_driver(drv: AsyncDriver):
    try:
        await drv.close()
    except Exception:
        pass


async def _warm_partitions(conn_id: str) -> None:
    try:
        await _get_partitions(conn_id, False)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        print(f"[CLUSTERS_WARMUP] Failed for {conn_id}: {type(exc).__name__}: {exc}")
    finally:
        current_task = asyncio.current_task()
        if PARTITION_WARMUP_TASKS.get(conn_id) is current_task:
            PARTITION_WARMUP_TASKS.pop(conn_id, None)


async def _warm_schema(conn_id: str) -> None:
    try:
        await _get_schema_data(conn_id, False)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        print(f"[SCHEMA_WARMUP] Failed for {conn_id}: {type(exc).__name__}: {exc}")
    finally:
        current_task = asyncio.current_task()
        if SCHEMA_WARMUP_TASKS.get(conn_id) is current_task:
            SCHEMA_WARMUP_TASKS.pop(conn_id, None)


def _schedule_partition_warmup(conn_id: str) -> None:
    current_task = PARTITION_WARMUP_TASKS.get(conn_id)
    if current_task and not current_task.done():
        return

    PARTITION_WARMUP_TASKS[conn_id] = asyncio.create_task(_warm_partitions(conn_id))


def _schedule_schema_warmup(conn_id: str) -> None:
    current_task = SCHEMA_WARMUP_TASKS.get(conn_id)
    if current_task and not current_task.done():
        return

    SCHEMA_WARMUP_TASKS[conn_id] = asyncio.create_task(_warm_schema(conn_id))


@app.post("/validate")
async def validate_connection(payload: ConnectionPayload):

    conn_id = secrets.token_urlsafe(24)

    if DEMO_MODE:
        if not all((DEMO_NEO4J_URI, DEMO_NEO4J_USERNAME, DEMO_NEO4J_PASSWORD)):
            raise HTTPException(status_code=500, detail="Demo Neo4j credentials are not configured on the backend.")
        database_url = DEMO_NEO4J_URI
        database_username = DEMO_NEO4J_USERNAME
        database_password = DEMO_NEO4J_PASSWORD
    else:
        database_url = payload.url
        database_username = payload.username
        database_password = payload.password

    DATABASE_URL_CACHE[conn_id] = database_url
    DATABASE_NAME_CACHE[conn_id] = database_username
    PARTITION_ID_CACHE[conn_id] = "pid"

    try:
        drv = AsyncGraphDatabase.driver( #creating a pool of threads for TCP connections
            database_url,
            auth=(database_username, database_password),
            keep_alive=True,
            max_connection_lifetime=180.0,
        )
        
        # This will catch wrong passwords, wrong URLs, or Aura SSL issues immediately.
        await drv.verify_connectivity()
        
        DRIVER_CACHE[conn_id] = (drv, time.time())

    except Exception as e:
        print(f"CRITICAL DRIVER ERROR: {type(e).__name__} - {e}")
        raise HTTPException(status_code=401, detail=f"{e}")

    return {"ok": True, "conn_id": conn_id}


@app.get("/saved-queries")
async def get_saved_queries(conn_id: str):
    redis_key = database_saved_query_key(conn_id)

    try:
        await remember_saved_query_database(redis_key, conn_id)
        queries = await read_saved_queries_from_redis(redis_key)
        return {"queries": queries}
    except RedisError as e:
        raise HTTPException(status_code=503, detail="Redis is unavailable for saved queries.")


@app.post("/saved-queries")
async def save_query(payload: SavedQueryRequest):
    query = normalize(payload.query)
    if not query:
        raise HTTPException(status_code=400, detail="Cannot save an empty query.")

    redis_key = database_saved_query_key(payload.conn_id)
    now = int(time.time())
    query_id = saved_query_id(query)
    saved_query = {
        "id": query_id,
        "query": query,
        "saved_at": now,
    }
    serialized_saved_query = json.dumps(saved_query, ensure_ascii=False, sort_keys=True)

    try:
        await remember_saved_query_database(redis_key, payload.conn_id)

        raw_queries = await REDIS_CLIENT.lrange(redis_key, 0, -1)
        duplicate_raw_queries = [
            raw
            for raw in raw_queries
            if (parse_saved_query(raw) or {}).get("id") == query_id
        ]

        async with REDIS_CLIENT.pipeline(transaction=True) as pipe:
            for duplicate_raw_query in duplicate_raw_queries:
                pipe.lrem(redis_key, 0, duplicate_raw_query)
            pipe.lpush(redis_key, serialized_saved_query)
            pipe.ltrim(redis_key, 0, SAVED_QUERY_LIMIT - 1)
            await pipe.execute()

        queries = await read_saved_queries_from_redis(redis_key)
        return {"ok": True, "saved_query": saved_query, "queries": queries}
    except RedisError as e:
        print(f"[SAVED_QUERIES][REDIS ERROR] {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="Redis is unavailable for saved queries.")


@app.delete("/saved-queries")
async def delete_saved_query(payload: DeleteSavedQueryRequest):
    redis_key = database_saved_query_key(payload.conn_id)

    try:
        raw_queries = await REDIS_CLIENT.lrange(redis_key, 0, -1)
        matching_raw_query = next(
            (
                raw
                for raw in raw_queries
                if (parse_saved_query(raw) or {}).get("id") == payload.query_id
            ),
            None,
        )

        if matching_raw_query is None:
            raise HTTPException(status_code=404, detail="Saved query not found.")

        await REDIS_CLIENT.lrem(redis_key, 1, matching_raw_query)
        queries = await read_saved_queries_from_redis(redis_key)
        return {"ok": True, "queries": queries}
    except RedisError as e:
        print(f"[SAVED_QUERIES][REDIS ERROR] {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="Redis is unavailable for saved queries.")


@app.get("/caches")
async def init_caches(conn_id: str):
    # _evict_expired()

    entry = DRIVER_CACHE.get(conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    drv, _ = entry
    DRIVER_CACHE[conn_id] = (drv, time.time())
    
    pid = PARTITION_ID_CACHE[conn_id]
    
    query = """
            MATCH (a)-[r]-(b) WHERE labels(a) <> labels(b)
            WITH a, r, b, count{(a)<--()} AS deg_a, count{(b)<--()} AS deg_b
            RETURN a, r, b, deg_a, deg_b
            LIMIT 12
        """
        
    noPid = False
    shaped = []

    try:
        async with drv.session() as session:

            # result = await session.run(f"""
            #     MATCH (n)
            #     WHERE n.{pid} IS NULL
            #     RETURN count(n) AS missing
            # """)
            # record = await result.single()
            noPid=False
            #noPid = record["missing"] == 0 # WARNING ONLY FOR TESTING THE ORIGINAL IS : != 0

            result = await session.run("CALL db.labels() YIELD label RETURN label")
            rows = [r async for r in result]
            node_labels = [r["label"] for r in rows]
            COLORS_CACHE[conn_id] = build_label_color_map(node_labels, min_hue_gap= (360 / 6) - 15)
            
            result = await session.run(query)
            column_names = list(result.keys())
            records = [r async for r in result]

            # Single pass: collect graph AND node_ids simultaneously
            # Build global_degrees from the records themselves — no second DB call
            global_degrees = {}
            for rec in records:
                a, b = rec.get("a"), rec.get("b")
                if a: global_degrees[a.element_id] = rec["deg_a"]
                if b: global_degrees[b.element_id] = rec["deg_b"]

            _ , finish_shape = shape_result(
                records, column_names,
                for_anonymous=False,
                colors=COLORS_CACHE[conn_id],
                for_partitions=False,
                pid_name=pid,
            )
            shaped = finish_shape(global_degrees)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # Return the initial graph immediately while schema and partition data warm
    # in the background. Statistics are intentionally loaded only after the
    # user clicks "Show Clusters".
    if not noPid:
        _schedule_partition_warmup(conn_id)
    _schedule_schema_warmup(conn_id)

    return {"records": shaped, "noPid": noPid}


@app.get("/restart")
async def restart_exploration(conn_id: str):
    _evict_expired()

    entry = DRIVER_CACHE.get(conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    drv, _ = entry
    DRIVER_CACHE[conn_id] = (drv, time.time())

    colors = COLORS_CACHE.get(conn_id, {})
    pid = PARTITION_ID_CACHE[conn_id]

    try:
        query = """
            MATCH (a)-[r]-(b) WHERE labels(a) <> labels(b)
            WITH a, r, b, count{(a)<--()} AS deg_a, count{(b)<--()} AS deg_b
            RETURN a, r, b, deg_a, deg_b
            LIMIT 12
        """
        async with drv.session() as session:
            result = await session.run(query)
            column_names = list(result.keys())
            records = [r async for r in result]

            # Single pass: collect graph AND node_ids simultaneously
            # Build global_degrees from the records themselves — no second DB call
            global_degrees = {}
            for rec in records:
                a, b = rec.get("a"), rec.get("b")
                if a: global_degrees[a.element_id] = rec["deg_a"]
                if b: global_degrees[b.element_id] = rec["deg_b"]

            _ , finish_shape = shape_result(
                records, column_names,
                for_anonymous=False,
                colors=colors,
                for_partitions=False,
                pid_name=pid,
            )
            shaped = finish_shape(global_degrees)

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"records": shaped}


async def _get_schema_data(conn_id: str, refresh: bool):
    _evict_expired()

    entry = DRIVER_CACHE.get(conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    drv, _ = entry
    DRIVER_CACHE[conn_id] = (drv, time.time())

    colors = COLORS_CACHE.get(conn_id, {})

    try:
        key = cache_key(conn_id)

        if not refresh:
            warmup_task = SCHEMA_WARMUP_TASKS.get(conn_id)
            current_task = asyncio.current_task()
            if warmup_task and warmup_task is not current_task and not warmup_task.done():
                try:
                    await warmup_task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    pass

        if (not refresh) and key in SCHEMA_CACHE:
            print("[SCHEMA] Served from cache")
            return copy.deepcopy(SCHEMA_CACHE[key])

        data = await compute_schema(drv)
        data["colors"] = colors
        SCHEMA_CACHE[key] = data
        return data

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/schema")
async def get_schema(payload: SchemaRequest):
    try:
        return await _get_schema_data(payload.conn_id, payload.refresh)
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/schema/export")
async def export_schema_csv(payload: SchemaRequest):
    _evict_expired()

    try:
        data = await _get_schema_data(payload.conn_id, payload.refresh)
        data["colors"] = COLORS_CACHE.get(payload.conn_id, {})

        buf = io.StringIO()
        w = csv.writer(buf)

        for e in data["edges"]:
            w.writerow(["REL", f'{e["from"]}', f'{e["type"]}', f'{e["to"]}'])
        w.writerow(["", ""])

        for lbl in data["nodeLabels"]:
            props = ", ".join(data["nodeProperties"].get(lbl, []))
            w.writerow(["NODE LABEL | PROPERTY ", f"{lbl}", f"{props}"])
        w.writerow(["", ""])

        for rt in data["relationshipTypes"]:
            props = ", ".join(data["relProperties"].get(rt, []))
            w.writerow(["REL LABEL | PROPERTY ", f"{rt}", f"{props}"])

        csv_text = buf.getvalue()
        return StreamingResponse(
            iter([csv_text]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="schema.csv"'},
        )

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=501, detail=str(e))

TIMEOUT_S = 50.0
SAFETY_MAX_ROWS = 150

FORBIDDEN_PATTERNS = [
    r"\bcreate\b", r"\bmerge\b", r"\bset\b", r"\bdelete\b", r"\bdetach\b",
    r"\bremove\b", r"\bdrop\b", r"\balter\b", r"\brename\b", r"\bgrant\b",
    r"\brevoke\b", r"\bload\s+csv\b", r"\bforeach\b",
]
FORBIDDEN_RE = re.compile("|".join(FORBIDDEN_PATTERNS), re.IGNORECASE)
LIMIT_RE = re.compile(r"\blimit\b", re.IGNORECASE)
READ_START_RE = re.compile(r"^(match|optional\s+match|with|unwind|return)\b", re.IGNORECASE)

SAFE_CALL_RE = re.compile(
    r"^call\s+(?:db\.stats\.retrieve|db\.labels|db\.relationshiptypes|db\.schema\.visualization)\b"
    r"|"
    r"^call\s*\([^)]*\)\s*\{",
    re.IGNORECASE
)

def strip_comments(q: str) -> str:
    q = re.sub(r"/\*.*?\*/", "", q, flags=re.DOTALL)
    q = re.sub(r"//.*?(?=\n|;|$)", "", q)
    q = re.sub(r"\s+", " ", q)
    return q.strip()


def normalize(q: str) -> str:
    q = strip_comments(q).strip() # removes comments and removes any spaces or newlines at the very beginning and end of the string.
    q = re.sub(r"\s+", " ", q).strip() 
    return q


def is_read_only(q_norm: str) -> bool:
    
    q_low = q_norm.lower()
    
    if ";" in q_low:
        return False
    
    # extra protection for CALL
    print(q_low)
    print(SAFE_CALL_RE.search(q_norm))
    if q_low.startswith("call"):
        if not SAFE_CALL_RE.search(q_norm):
            return False
        else:
            return True

    if not READ_START_RE.search(q_norm):
        return False

    if FORBIDDEN_RE.search(q_norm):
        return False

    return True


def inject_default_limit_if_missing( q_norm: str ):

    if LIMIT_RE.search(q_norm) or SAFE_CALL_RE.search(q_norm):
        return q_norm, {}, False
    
    q_norm = f"{q_norm} LIMIT $___rowLimit"
    
    params = {
        "___rowLimit": SAFETY_MAX_ROWS
    }

    return q_norm, params, True


@app.post("/cypher")
async def run_cypher(payload: CypherRequest):
    _evict_expired()

    entry = DRIVER_CACHE.get(payload.conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    drv, _ = entry
    DRIVER_CACHE[payload.conn_id] = (drv, time.time())

    colors = COLORS_CACHE.get(payload.conn_id, {})
    pid = PARTITION_ID_CACHE[payload.conn_id]

    q_norm = normalize(payload.query)
    if not is_read_only(q_norm):
        raise HTTPException(status_code=400, detail="Only read-only Cypher is allowed and not multiple queries")

    q_final, params_final, default_limit_applied = inject_default_limit_if_missing(q_norm)

    for_query_partitions = detect_pid_access(tokenize(q_final), pid)

    global_degrees = {}
    try:
        async with drv.session(default_access_mode=neo4j.READ_ACCESS) as session:
            result = await session.run(Query(q_final, timeout=TIMEOUT_S), params_final)
            column_names = list(result.keys())
            records = [r async for r in result]
            print("!!!!!!!!!!", records)

            node_ids, finish_shape = shape_result(
                records, column_names,
                payload.anonymous,
                colors=colors,
                for_partitions=False,
                pid_name=pid,
            )

            if not payload.anonymous and node_ids:
                    deg_query = "UNWIND $ids AS id MATCH (n) WHERE elementId(n) = id RETURN id, count{(n)<--()} AS d"
                    deg_result = await session.run(deg_query, ids=node_ids)
                    global_degrees = {row["id"]: row["d"] async for row in deg_result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    shaped = finish_shape(global_degrees)
    shaped["partitions"] = False
    shaped["for_query_partitions"] = for_query_partitions

    return {"records": shaped, "defaultLimitApplied": default_limit_applied}


@app.get("/node/{node_id}/data")
async def node_data(node_id: str, conn_id: str):
    _evict_expired()

    entry = DRIVER_CACHE.get(conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    drv, _ = entry
    DRIVER_CACHE[conn_id] = (drv, time.time())

    cypher = """
    MATCH (n) WHERE elementId(n) = $id
    CALL (n) {
        MATCH (n)-[r]->(m)
        RETURN 'out' AS dir, type(r) AS relType, head(labels(m)) AS otherLabel, count(*) AS count
        UNION ALL
        WITH n
        MATCH (n)<-[r]-(m)
        RETURN 'in' AS dir, type(r) AS relType, head(labels(m)) AS otherLabel, count(*) AS count
    }
    RETURN
        head(labels(n)) AS selfLabel,
        dir,
        relType,
        otherLabel,
        count
    ORDER BY count DESC, relType
    """
    async with drv.session() as s:
        result = await s.run(cypher, id=node_id)
        recs = [r async for r in result]

    if not recs:
        raise HTTPException(404, "Node not found")

    return [
        {
            "selfLabel": r["selfLabel"],
            "direction": r["dir"],
            "type": r["relType"],
            "otherLabel": r["otherLabel"],
            "count": r["count"],
        }
        for r in recs
    ]


async def _get_partitions(conn_id: str, refresh: bool):
    _evict_expired()

    entry = DRIVER_CACHE.get(conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    drv, _ = entry
    DRIVER_CACHE[conn_id] = (drv, time.time())

    colors = COLORS_CACHE.get(conn_id, {})
    pid = PARTITION_ID_CACHE[conn_id]
    key = cache_key(conn_id)

    if not refresh:
        warmup_task = PARTITION_WARMUP_TASKS.get(conn_id)
        current_task = asyncio.current_task()

        if warmup_task and warmup_task is not current_task and not warmup_task.done():
            try:
                await warmup_task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass

    if (not refresh) and key in CLUSTERS_CACHE:
        print("[CLUSTERS_CACHE] Served from cache")
        return copy.deepcopy(CLUSTERS_CACHE[key])

    COUNT_PARTITIONS_CYPHER = f"""
        MATCH (n)
        WHERE n.{pid} IS NOT NULL
        WITH DISTINCT n.{pid} AS pid
        RETURN pid
        ORDER BY pid
    """

    PARTITION_CYPHER = f"""
        UNWIND $pids AS pid
        WITH DISTINCT pid

        CALL (pid) {{

            MATCH (n)
            WHERE n.pid = pid

            WITH n, pid,

                COUNT {{
                    (n)<--()
                }} AS inDegree,

                COUNT {{
                    (n)--(other)
                    WHERE other.pid IN $pids
                    AND other.pid <> pid
                }} AS crossDegree

            WHERE crossDegree > 0

            ORDER BY
                inDegree DESC,
                crossDegree DESC,
                elementId(n)

            LIMIT $perPidNodes

            RETURN
                n AS seed,
                inDegree,
                crossDegree
        }}

        WITH collect(DISTINCT seed) AS selectedNodes

        UNWIND selectedNodes AS a

        OPTIONAL MATCH (a)-[r]-(b)
        WHERE b IN selectedNodes
        AND elementId(a) < elementId(b)

        RETURN a, r, b;
    """

    try:
        async with drv.session() as session:
            local_partition_ids = PARTITION_IDS_CACHE.get(conn_id, [])
            if (not local_partition_ids):
                partitions_res = await session.run(COUNT_PARTITIONS_CYPHER, {"pid": pid})
                local_partition_ids = [rec["pid"] async for rec in partitions_res]
                PARTITION_IDS_CACHE[conn_id] = local_partition_ids
                print("LOCAL PARTITION IDS for clusters:", local_partition_ids)
            num_partitions = len(local_partition_ids)

            params = {
                "lim": 100,
                "crossEdgesPerNode": 1, "perPidNodes": 10,
                "pids": local_partition_ids,
            }

            result = await session.run(PARTITION_CYPHER, params)
            column_names = list(result.keys())
            records = [r async for r in result]

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    _, finish_shape = shape_result(
        records, column_names,
        for_anonymous=False,
        colors=colors,
        for_partitions=True,
        pid_name=pid,
    )
    # node_ids discarded — no degree query for partitions
    shaped = finish_shape({})
    shaped["num_partitions"]        = num_partitions
    shaped["partitions"]            = True
    shaped["for_query_partitions"]  = False

    CLUSTERS_CACHE[key] = {"records": shaped}
    return {"records": shaped}


async def _get_partition_stats(conn_id: str, refresh: bool):
    _evict_expired()

    entry = DRIVER_CACHE.get(conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    drv, _ = entry
    DRIVER_CACHE[conn_id] = (drv, time.time())

    pid = PARTITION_ID_CACHE[conn_id]
    
    COUNT_PARTITIONS_CYPHER = f"""
        MATCH (n)
        WHERE n.{pid} IS NOT NULL
        WITH DISTINCT n.{pid} AS pid
        RETURN pid
        ORDER BY pid
    """

    PARTITION_STATS_CYPHER = f"""
       UNWIND $pids AS pid

       // Pass 1: node stats + incoming crossing edges
        CALL (pid) {{
            MATCH (n)
            WHERE n.{pid} = pid

            // OUTGOING edges
            OPTIONAL MATCH (n)-[r_out]->(out)
            WITH n, r_out, out

            WITH n,
                count(CASE WHEN out.{pid} = pid THEN r_out END) AS internal_out,
                count(CASE WHEN out.{pid} <> pid THEN r_out END) AS crossOut

            // INCOMING edges (separate match!)
            OPTIONAL MATCH (in)-[r_in]->(n)
            WITH n, internal_out, crossOut, r_in, in

            WITH n,
                internal_out,
                crossOut,
                count(CASE WHEN in.{pid} = pid THEN r_in END) AS internal_in,
                count(CASE WHEN in.{pid} <> pid THEN r_in END) AS crossIn

            RETURN
                count(n) AS `Total nodes`,
                coalesce(sum(size(keys(n))), 0) AS Cost,
                (sum(internal_out) + sum(internal_in)) / 2 AS `Internal edges`,
                sum(crossOut) AS `Outgoing Crossing edges`,
                sum(crossIn) AS `Incoming Crossing edges`
        }}

        // Pass 2: crossing summary (group by otherPid)
        CALL (pid) {{
            MATCH (a)-[r]-(b)
            WHERE a.{pid} = pid AND b.{pid} <> pid
            WITH b.{pid} AS otherPid, count(r) AS edgeCount
            ORDER BY edgeCount
            RETURN collect({{otherPid: otherPid, edgeCount: edgeCount}}) AS crossingSummary
        }}

        WITH pid, `Total nodes`, Cost, `Internal edges`, `Outgoing Crossing edges`, crossingSummary,`Incoming Crossing edges`
        WHERE `Total nodes` > 0
        RETURN
            pid,
            `Total nodes`,
            Cost,
            `Internal edges`,
            `Incoming Crossing edges`,
            `Outgoing Crossing edges`,
            crossingSummary
        ORDER BY pid
        """

    key = cache_key(conn_id)

    if (not refresh) and key in CLUSTERS_STATS_CACHE:
        print("[CLUSTERS_STATS_CACHE] Served from cache")
        return copy.deepcopy(CLUSTERS_STATS_CACHE[key])

    try:
        async with drv.session() as session:
            local_partition_ids = PARTITION_IDS_CACHE.get(conn_id, [])
            if (not local_partition_ids):
                partitions_res = await session.run(COUNT_PARTITIONS_CYPHER, {"pid": pid})
                local_partition_ids = [rec["pid"] async for rec in partitions_res]
                PARTITION_IDS_CACHE[conn_id] = local_partition_ids
                print("LOCAL PARTITION IDS:", local_partition_ids)
            params = {"pids": local_partition_ids}
            result = await session.run(PARTITION_STATS_CYPHER, params)
            records = [dict(r) async for r in result]
            CLUSTERS_STATS_CACHE[key] = {"records": records}
            return {"records": records}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/partition-graph")
async def partition_graph(conn_id: str, refresh: bool):
    try:
        return await _get_partitions(conn_id, refresh)
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/partitions/stats")
async def get_partition_stats(conn_id: str, refresh: bool = False) -> Dict[str, Any]:
    try:
        return await _get_partition_stats(conn_id, refresh)
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/refresh")
async def refresh_cache(payload: SchemaRequest):
    entry = DRIVER_CACHE.get(payload.conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    # Cancel only refresh-sensitive work that is still pending.  A completed
    # task is not cancelled; any cache invalidation happens independently.
    if payload.refresh:
        invalidate_connection_caches(payload.conn_id)

    drv, _ = entry
    DRIVER_CACHE[payload.conn_id] = (drv, time.time())

    try:
        async with drv.session() as session:
            result = await session.run("CALL db.labels() YIELD label RETURN label")
            rows = [r async for r in result]
            node_labels = [r["label"] for r in rows]
            COLORS_CACHE[payload.conn_id] = build_label_color_map(node_labels, min_hue_gap=  (360 / 6) - 15)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    return {"ok": True, "label_count": len(node_labels)}


@app.get("/database-metadata")
async def get_databse_metadata(conn_id: str):
    _evict_expired()

    entry = DRIVER_CACHE.get(conn_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired conn_id. Call /validate again.")

    drv, _ = entry
    DRIVER_CACHE[conn_id] = (drv, time.time())

    database_name = DATABASE_NAME_CACHE.get(conn_id)
    databse_url = DATABASE_URL_CACHE.get(conn_id)

    try:
        async with drv.session() as session:
            result = await session.run("""
                CALL dbms.components() YIELD versions, edition
                RETURN versions[0] AS version, edition
            """)
            record = await result.single()

            return {
                "url": databse_url,
                "neo4j_version": record["version"],
                "edition": record["edition"],
                "database": database_name,
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

def is_identifier(token):
    return token.isidentifier() #built-in string check that determines if a string is a valid name according to the Python language rules. (Unicode-aware)

def is_string(token):
    return (token.startswith("'") and token.endswith("'")) or \
           (token.startswith('"') and token.endswith('"'))

def strip_quotes(token):
    return token[1:-1]

def match(tokens, i, pattern):
    if i + len(pattern) > len(tokens):
        return False

    for j, p in enumerate(pattern):
        t = tokens[i + j]

        if p == "IDENTIFIER" and not is_identifier(t):
            return False
        elif p == "STRING" and not is_string(t):
            return False
        elif p not in ["IDENTIFIER", "STRING"] and t != p:
            return False

    return True

def detect_pid_access(tokens,pid):
    env = {}

    i = 0
    while i < len(tokens):

        # ------------------------
        # WITH 'pid' AS k
        # ------------------------
        if tokens[i] == "with":
            if (i + 3 < len(tokens)
                and is_string(tokens[i+1])
                and tokens[i+2] == "as"
                and is_identifier(tokens[i+3])):
                
                env[tokens[i+3]] = strip_quotes(tokens[i+1])

        # ------------------------
        # 1. n.pid
        # ------------------------
        if match(tokens, i, ["IDENTIFIER", ".", "IDENTIFIER"]):
            if tokens[i+2] == pid:
                return True

        # ------------------------
        # 2. n['pid']
        # ------------------------
        if match(tokens, i, ["IDENTIFIER", "[", "STRING", "]"]):
            if strip_quotes(tokens[i+2]) == pid :
                return True

        # ------------------------
        # 3. n[k]
        # ------------------------
        if match(tokens, i, ["IDENTIFIER", "[", "IDENTIFIER", "]"]):
            key = tokens[i+2]
            if env.get(key) == pid:
                return True

        # ------------------------
        # 4. n { .pid }
        # ------------------------
        if match(tokens, i, ["IDENTIFIER", "{", ".", "IDENTIFIER", "}"]):
            if tokens[i+3] == pid:
                return True

        # ------------------------
        # 5. properties(n).pid
        # ------------------------
        if (tokens[i] == "properties"
            and i + 5 < len(tokens)
            and tokens[i+1] == "("
            and is_identifier(tokens[i+2])
            and tokens[i+3] == ")"
            and tokens[i+4] == "."
            and tokens[i+5] == pid):
            
            return True
        
        # 6. (n:Movie {pid: 2})
        if (
            tokens[i] == "{"
            and i + 2 < len(tokens)
            and tokens[i + 1] == pid
            and tokens[i + 2] == ":"
        ):
            return True

        i += 1

    return False

def tokenize(query):
    query = query.lower()

    # 4 patterns:
    # 1. Identifiers and Keywords (letters-words)
    # 2. Single-Quoted Strings
    # 3. Double-Quoted Strings
    # 4. Individual punctuation marks used for structure
    tokens = re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*|'.*?'|\".*?\"|[\.\{\}\[\]\(\)]", query)

    return tokens

# MATCH (a:Person)-[r]-(b) RETURN a, r, b LIMIT 2
# MATCH (n) RETURN elementId(n) AS id, labels(n) AS labels LIMIT 15 (table)
# MATCH (n)  RETURN n LIMIT 
# MATCH (a)-[r]->(b) RETURN a.name AS from, type(r) AS rel,b.name AS to,a, r, b LIMIT 10
# RETURN {id: "v1", labels: ["Virtual"], name: "I am fake"} as node, point({x: 12, y: 34}) as location,datetime() as now
# CALL () { MATCH (a) WHERE a.cid= 1 RETURN a, COUNT { (a)<--() } AS inDegree ORDER BY inDegree DESC LIMIT 10 } WITH collect(a) AS topA CALL () { MATCH (b) WHERE b.cid = 2 RETURN b, COUNT { (b)<--() } AS inDegree ORDER BY inDegree DESC LIMIT 10 } WITH topA, collect(b) AS topB MATCH (a)-[r]-(b) WHERE a IN topA AND b IN topB RETURN a, r, b

