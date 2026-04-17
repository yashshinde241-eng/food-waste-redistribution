import random
import time
import heapq
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import networkx as nx
from algorithms import run_edmonds_karp, a_star_search

class FoodBatch:
    def __init__(self, expiry_time, batch_id, quantity, donor_id):
        self.expiry_time = expiry_time
        self.batch_id = batch_id
        self.quantity = quantity
        self.donor_id = donor_id

    def __lt__(self, other):
        return self.expiry_time < other.expiry_time

    def to_dict(self):
        return {"expiry_time": self.expiry_time, "batch_id": self.batch_id, "quantity": self.quantity, "donor_id": self.donor_id}


app = FastAPI()

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Initialize the graph
G = nx.Graph()

# Define Pune landmarks and fixed positions
fixed_positions = {
    "Kothrud": (-5, 0, 5), "Viman Nagar": (8, 0, -6), "Hinjewadi": (-10, 0, -8),
    "Magarpatta": (10, 0, 2), "Baner": (-7, 0, -4), "Deccan Gymkhana": (-1, 0, 1),
    "Swargate": (1, 0, 6), "Hadapsar": (9, 0, 5), "Pashan": (-8, 0, 0), "Koregaon Park": (5, 0, -2)
}

landmarks = list(fixed_positions.keys())
types = ["Restaurant", "Shelter", "Hub"]

food_batches = []
batch_counter = 1

# Add nodes with fixed positions, types, supply, and demand
for landmark in landmarks:
    node_type = random.choice(types)
    supply = random.randint(10, 50) if node_type == "Restaurant" else 0
    demand = random.randint(10, 50) if node_type == "Shelter" else 0
    
    if node_type == "Restaurant":
        expiry = int(time.time()) + random.randint(3600, 86400) # Expire in 1-24 hours
        batch = FoodBatch(expiry, batch_counter, supply, landmark)
        heapq.heappush(food_batches, batch)
        batch_counter += 1
        
    G.add_node(
        landmark,
        pos=fixed_positions[landmark],
        type=node_type,
        supply=supply,
        demand=demand
    )

# Add some random weighted edges (Roads) with capacity
for i in range(len(landmarks)):
    for j in range(i + 1, len(landmarks)):
        if random.random() < 0.3:  # 30% chance of a road between any two points
            distance = random.uniform(1.0, 15.0)
            capacity = random.randint(10, 30)
            G.add_edge(landmarks[i], landmarks[j], distance=distance, capacity=capacity)

@app.get("/api/map")
def get_map():
    # Convert graph data to a JSON serializable format
    nodes = [{"id": n, "pos": d["pos"], "type": d["type"], "supply": d["supply"], "demand": d["demand"]} for n, d in G.nodes(data=True)]
    edges = [{"source": u, "target": v, "distance": d["distance"], "capacity": d["capacity"]} for u, v, d in G.edges(data=True)]
    return {"nodes": nodes, "edges": edges}

@app.get("/api/distribute")
def distribute_food():
    # Run the Edmonds-Karp algorithm manually
    result = run_edmonds_karp(G)
    return result

@app.get("/api/perishables")
def get_perishables():
    # Return sorted (by urgency) list of food batches
    sorted_batches = sorted(food_batches)
    return [b.to_dict() for b in sorted_batches]

@app.get("/api/navigate")
def navigate(start: str, end: str):
    return a_star_search(G, start, end)
