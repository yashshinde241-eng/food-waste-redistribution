import collections

def run_edmonds_karp(graph):
    """
    Manually implements the Edmonds-Karp algorithm using BFS to find augmenting paths.
    """
    nodes = list(graph.nodes(data=True))
    edges = list(graph.edges(data=True))
    
    residual = collections.defaultdict(lambda: collections.defaultdict(int))
    flow_map = collections.defaultdict(lambda: collections.defaultdict(int))
    
    # 1. Setup capacities for Super-Source and Super-Sink
    for n_id, data in nodes:
        supply = data.get('supply', 0)
        demand = data.get('demand', 0)
        
        if supply > 0:
            residual['S_SOURCE'][n_id] = supply
            residual[n_id]['S_SOURCE'] = 0
        if demand > 0:
            residual[n_id]['S_SINK'] = demand
            residual['S_SINK'][n_id] = 0
            
    # 2. Setup capacities for roads (treat as undirected/bidirectional limits)
    for u, v, data in edges:
        cap = data.get('capacity', 0)
        # Adding to existing capacity in case of multiple edges or pre-existing logic
        residual[u][v] += cap
        residual[v][u] += cap
        
    def bfs():
        parent = {}
        visited = set(['S_SOURCE'])
        queue = collections.deque(['S_SOURCE'])
        
        while queue:
            u = queue.popleft()
            for v, cap in residual[u].items():
                if v not in visited and cap > 0:
                    visited.add(v)
                    parent[v] = u
                    queue.append(v)
                    if v == 'S_SINK':
                        return parent
        return None

    total_flow = 0
    # 3. Augment paths while a path exists in the residual graph
    while True:
        parent = bfs()
        if not parent:
            break
            
        # Find bottleneck capacity along the path
        path_flow = float('Inf')
        s = 'S_SINK'
        while s != 'S_SOURCE':
            u = parent[s]
            path_flow = min(path_flow, residual[u][s])
            s = u
            
        # Update residual capacities and track net flow
        s = 'S_SINK'
        while s != 'S_SOURCE':
            u = parent[s]
            residual[u][s] -= path_flow
            residual[s][u] += path_flow
            
            # Track actual flow on real edges (ignore super nodes)
            if u != 'S_SOURCE' and s != 'S_SINK':
                flow_map[u][s] += path_flow
                flow_map[s][u] -= path_flow
                
            s = u
            
        total_flow += path_flow

    # 4. Extract net positive flows for the frontend
    final_flows = []
    # Iterate over original edges to avoid tracking virtual or reverse negative flows incorrectly
    for u, v in graph.edges():
        f = flow_map[u][v]
        if f > 0:
            final_flows.append({"source": u, "target": v, "flow": f})
        elif f < 0:
            final_flows.append({"source": v, "target": u, "flow": -f})
            
    return {"total_flow": total_flow, "flows": final_flows}

import math
import heapq

def a_star_search(graph, start, end):
    """
    Manually implements the A* algorithm using Euclidean distance as the heuristic.
    """
    def heuristic(u, v):
        pos_u = graph.nodes[u]['pos']
        pos_v = graph.nodes[v]['pos']
        return math.sqrt((pos_u[0] - pos_v[0])**2 + (pos_u[1] - pos_v[1])**2 + (pos_u[2] - pos_v[2])**2)
        
    open_set = []
    heapq.heappush(open_set, (0, start))
    
    came_from = {}
    g_score = collections.defaultdict(lambda: float('inf'))
    g_score[start] = 0
    
    f_score = collections.defaultdict(lambda: float('inf'))
    f_score[start] = heuristic(start, end)
    
    while open_set:
        _, current = heapq.heappop(open_set)
        
        if current == end:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return {"path": path, "distance": g_score[end]}
            
        for neighbor in graph.neighbors(current):
            edge_dist = graph.edges[current, neighbor].get('distance', heuristic(current, neighbor))
            tentative_g_score = g_score[current] + edge_dist
            
            if tentative_g_score < g_score[neighbor]:
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g_score
                f_score[neighbor] = tentative_g_score + heuristic(neighbor, end)
                heapq.heappush(open_set, (f_score[neighbor], neighbor))
                
    return {"path": [], "distance": -1}
