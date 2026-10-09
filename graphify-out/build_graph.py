import os
import sys
import json
from pathlib import Path

# Paths
ROOT = Path("D:/Desktop/zerodha")
OUT = ROOT / "graphify-out"
OUT.mkdir(parents=True, exist_ok=True)

(OUT / ".graphify_python").write_text(sys.executable, encoding="utf-8")
(OUT / ".graphify_root").write_text(str(ROOT), encoding="utf-8")

# Step 2: Detect files
print("--- Step 2: Detecting Files ---")
from graphify.detect import detect
detect_result = detect(ROOT)

# Filter out walkthrough or unwanted files if any remain
(OUT / ".graphify_detect.json").write_text(json.dumps(detect_result, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Detected {detect_result.get('total_files', 0)} files")
for cat, files in detect_result.get("files", {}).items():
    if files:
        print(f"  {cat}: {len(files)} files")

# Step 3: Extract
print("\n--- Step 3: Structural (AST) & Semantic Extraction ---")
from graphify.extract import collect_files, extract

code_files = []
for f in detect_result.get("files", {}).get("code", []):
    p = Path(f)
    if p.is_dir():
        code_files.extend(collect_files(p))
    else:
        code_files.append(p)

if code_files:
    ast_result = extract(code_files, cache_root=ROOT)
    (OUT / ".graphify_ast.json").write_text(json.dumps(ast_result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"AST: {len(ast_result['nodes'])} nodes, {len(ast_result['edges'])} edges")
else:
    ast_result = {'nodes': [], 'edges': [], 'input_tokens': 0, 'output_tokens': 0}
    (OUT / ".graphify_ast.json").write_text(json.dumps(ast_result), encoding="utf-8")

# Semantic extraction empty file (code-first project)
sem_result = {'nodes': [], 'edges': [], 'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}
(OUT / ".graphify_semantic.json").write_text(json.dumps(sem_result), encoding="utf-8")

# Merge AST + Semantic
seen = {n['id'] for n in ast_result['nodes']}
merged_nodes = list(ast_result['nodes'])
for n in sem_result['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])

merged_edges = ast_result['edges'] + sem_result['edges']
merged_hyperedges = sem_result.get('hyperedges', [])
merged = {
    'nodes': merged_nodes,
    'edges': merged_edges,
    'hyperedges': merged_hyperedges,
    'input_tokens': sem_result.get('input_tokens', 0),
    'output_tokens': sem_result.get('output_tokens', 0),
}
(OUT / ".graphify_extract.json").write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Merged: {len(merged_nodes)} nodes, {len(merged_edges)} edges")

# Step 4: Build graph, cluster, analyze
print("\n--- Step 4: Build, Cluster & Analyze ---")
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json

G = build_from_json(merged, root=str(ROOT), directed=False)
if G.number_of_nodes() == 0:
    print("ERROR: Graph is empty.")
    sys.exit(1)

communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': merged.get('input_tokens', 0), 'output': merged.get('output_tokens', 0)}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

# Generate meaningful community labels
community_labels = {}
for cid, nodes in communities.items():
    # Inspect node names in community
    node_names = [n for n in nodes[:5]]
    label = f"Module Group {cid}"
    if any("order" in n.lower() or "fund" in n.lower() or "hold" in n.lower() for n in node_names):
        label = "Trading & Ledger Engine"
    elif any("socket" in n.lower() or "chat" in n.lower() or "live" in n.lower() for n in node_names):
        label = "Real-Time WebSockets"
    elif any("ai" in n.lower() or "analyst" in n.lower() or "gemini" in n.lower() for n in node_names):
        label = "AI Portfolio Analyst"
    elif any("auth" in n.lower() or "user" in n.lower() or "signup" in n.lower() or "login" in n.lower() for n in node_names):
        label = "Authentication & User Management"
    elif any("chart" in n.lower() or "tech" in n.lower() or "modal" in n.lower() or "depth" in n.lower() for n in node_names):
        label = "Stock Analytics & Visualizations"
    elif any("front" in n.lower() or "landing" in n.lower() or "price" in n.lower() or "about" in n.lower() for n in node_names):
        label = "Marketing & Public Ecosystem"
    community_labels[cid] = label

questions = suggest_questions(G, communities, community_labels)

wrote = to_json(G, communities, str(OUT / "graph.json"), community_labels=community_labels)
report = generate(G, communities, cohesion, community_labels, gods, surprises, detect_result, tokens, str(ROOT), suggested_questions=questions)
(OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")

print(f"Graph Generated: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")
print("Exporting HTML visualization...")
os.system(f'"{sys.executable}" -m graphify.cli export html')

print("\nGraphify Pipeline Completed Successfully!")
