import networkx as nx
from algorithms import run_edmonds_karp

def test_edmonds_karp_simple():
    G = nx.Graph()
    # R1 -> H1 -> S1
    G.add_node("R1", type="Restaurant", supply=20, demand=0)
    G.add_node("H1", type="Hub", supply=0, demand=0)
    G.add_node("S1", type="Shelter", supply=0, demand=20)
    
    G.add_edge("R1", "H1", capacity=15)
    G.add_edge("H1", "S1", capacity=25)
    
    result = run_edmonds_karp(G)
    
    # Bottleneck is 15
    assert result["total_flow"] == 15
    
    flows = result["flows"]
    assert len(flows) == 2
    
    f1 = next(f for f in flows if f["source"] == "R1" and f["target"] == "H1" or f["source"] == "H1" and f["target"] == "R1")
    assert f1["flow"] == 15
    
    f2 = next(f for f in flows if f["source"] == "H1" and f["target"] == "S1" or f["source"] == "S1" and f["target"] == "H1")
    assert f2["flow"] == 15

def test_edmonds_karp_multiple():
    G = nx.Graph()
    G.add_node("R1", supply=10, demand=0)
    G.add_node("R2", supply=20, demand=0)
    G.add_node("S1", supply=0, demand=25)
    
    G.add_edge("R1", "S1", capacity=5)
    G.add_edge("R2", "S1", capacity=25)
    
    result = run_edmonds_karp(G)
    
    # R1 can send 5 (bottleneck capacity)
    # R2 can send 20 (bottleneck supply)
    # Total flow should be 25
    assert result["total_flow"] == 25
