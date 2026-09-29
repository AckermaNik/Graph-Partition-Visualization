## 🚀 Overview

A full-stack web application for **visualizing and analyzing graph-partitioned data** using a Neo4j database.

The system enables users to:

- Directly connect to their database with their credentials and explore their current data
- Visualize graph clusters and their relationships  
- Execute read-only Cypher queries  
- Explore graph structures interactively
- Export a detailed database schema  

---

## ✨ Features

- 🔐 Connect to user-provided Neo4j database instance 
- 📊 Interactive graph and cluster visualization with highlighting the most influential nodes by degree score 
- 🔎 Inspect node-level details along with their global information  
- 📈 Cluster statistics and database insights  
- 🧾 Execute read-only Cypher queries with export support  
- 💾 Saved queries per connection – retains the last 50 saved queries of a user per database URI and name

---

## 🧭 Getting Started

### 🗄️ Database Requirements

- Neo4j **5.x** active instance running  
- Required:
  - URI (`bolt://` or `neo4j://`)  
  - Database name  (neo4j by default)
  - Password  
- Recommended:
  - Integer type  
  - Indexed

> ⚠️ Only Neo4j 5.x is supported  

---

## 🔌 Connection Setup

Provide:

- Database URI (`bolt://` or `neo4j://`)  
- Database name  
- Database password  
---

## ▶️ Run the App

- Fill in database credentials   
- Click **Start**  

---

## 🗂️ Application Features

### 🔄 Database Insights

- Node count & labels (with colors)  
- Relationship types & counts  
- Export schema as `.csv` 
- Refresh the database upon any external change 

---

### 🧩 Cluster Visualization

- View partitions via **"Show all clusters"**

Displays:

- Top 10 influential nodes per cluster (Top 10 nodes with highest ,      global, incoming degree - authorities)
- Cross and intra-partition relationships  

### ⚡ Asynchronous Cache Warm-up

The connection-startup cache flow is intentionally asynchronous so the first
screen is not blocked by the full graph workload:

- `/caches` returns the initial 12-node demo graph immediately.
- The schema cache and full partition/cluster graph cache warm in background
  `asyncio` tasks.
- If the frontend requests either resource while its warm-up task is still
  running, it waits for that same in-flight task instead of starting a
  duplicate database query.
- Cluster statistics are **not** warmed during connection startup. They are
  requested after the cluster graph is visualized, when the user clicks
  **"Show all clusters"**, and are then stored in `CLUSTERS_STATS_CACHE`.
- The statistics are associated with the panel that requested them, so an old
  open panel can continue displaying its own database version.
- A database refresh clears the schema, cluster graph, cluster statistics, and
  partition-ID caches. It also cancels any schema or partition warm-up tasks
  that are still pending. Results that completed before the refresh are
  allowed to remain as already-returned results.

The backend keeps separate task registries for schema and partition warm-ups
and removes each task when it completes, fails, or is cancelled.

---

### 📊 Cluster Metrics

- Node count per cluster  
- Outgoing crossing relationships per cluster
- Outgoing crossing relationships per cluster pair
- Incoming crossing relationships per cluster
- Internal relationships per cluster
- Aggregated node properties (e.g., cluster cost)  

---

### 🧭 Graph Interaction

- Max: **1000 nodes per panel**  
- Zoom & fit controls  
- Export current graph image as PNG
- Click nodes for detailed properties  

---

### 🔎 Cypher Queries

- Execute via top query bar  

**Constraints:**

- ✅ Read-only queries  
- ❌ No multiple queries 
- ❌ No write queries
- ❌ No administrative queries  
- 🔢 Default `LIMIT 100` if missing  

**Output:**

- Graph view and/or table  
- Table preview (10 rows)  
- Full export as `.csv`  

**The user can save queries:**

- Last 50 user saved queries are kept per database URI and name  
- Queries are persisted across sessions via Redis

---

## 🧰 Tech Stack

### Frontend

- React 19  
- Vite  
- Bootstrap 5  
- React-Bootstrap  
- npm / yarn  

### Graph Visualization

- Sigma.js v3  
- Graphology  
- ForceAtlas2  
- Noverlap  
- D3  

### Backend

- Python  
- FastAPI  
- Uvicorn  

### Forms & Data

- Formik  
- React Hook Form  
- Yup  
- SWR  

---

## ⚙️ Requirements

- Node.js: ≥ 24.13.0  
- Python: 3.x  
- Neo4j: ≥ 5.26.2  

---

## ▶️ Running the Project

### Frontend

```bash
cd app
npm start
```

---

### 🗃️ Redis Server (for saved queries)

#### Debian

```bash
# If not installed
sudo apt install redis-server

redis-server
```

---

### Backend

#### Windows

```bash
cd app
.venv\Scripts\activate

# If not installed
pip install -r requirements.txt

python -u -m uvicorn backend.main:app
```

#### 🐧 Linux / macOS

```bash
cd app
source .venv/bin/activate

# If not installed
pip install -r requirements.txt

python -u -m uvicorn backend.main:app
```

---

## 📌 Summary

This application provides a complete environment for:

- Graph partition visualization  
- Cluster analysis  
- Interactive exploration
- Node information and their global statistics
- Schema export  
- Safe Cypher querying  

Built for research, analytics, and exploration of **property graphs and their partitions**.

---

## 📄 License

MIT License
