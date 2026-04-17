import random
import time
import heapq
import asyncio
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

# Define Pune landmarks and fixed positions (Spaced out for a clean, non-overlapping grid)
fixed_positions = {
    # North West
    "Hinjewadi": (-24, 0, -20), "Wakad": (-16, 0, -18), "Baner": (-10, 0, -14), "Aundh": (-4, 0, -12),
    # North East
    "Viman Nagar": (14, 0, -18), "Kharadi": (24, 0, -16), "Kalyani Nagar": (8, 0, -12), "Yerawada": (18, 0, -8),
    # West
    "Pashan": (-20, 0, -4), "Bavdhan": (-16, 0, 4), "Kothrud": (-22, 0, 12), "Warje": (-14, 0, 18),
    # Center
    "Shivajinagar": (0, 0, -4), "Deccan Gymkhana": (-6, 0, 2), "Camp": (6, 0, 4), "Koregaon Park": (12, 0, -2),
    # South / South East
    "Swargate": (0, 0, 14), "Katraj": (2, 0, 24), "Magarpatta": (20, 0, 6), "Hadapsar": (24, 0, 16)
}

landmarks = list(fixed_positions.keys())
types = ["Restaurant", "Shelter", "Hub"]

food_batches = []
batch_counter = 1
waste_counter = 0
total_generated = 0
total_delivered = 0

# Add nodes with fixed positions, types, supply, and demand
for landmark in landmarks:
    node_type = random.choice(types)
    supply = random.randint(10, 50) if node_type == "Restaurant" else 0
    demand = random.randint(10, 50) if node_type == "Shelter" else 0
    
    if node_type == "Restaurant":
        expiry = int(time.time()) + random.randint(15, 60) # Expire in 15-60 SECONDS for fast simulation
        batch = FoodBatch(expiry, batch_counter, supply, landmark)
        heapq.heappush(food_batches, batch)
        total_generated += supply
        batch_counter += 1
        
    G.add_node(
        landmark,
        pos=fixed_positions[landmark],
        type=node_type,
        supply=supply,
        demand=demand
    )

# Add roads: Connect each node to its 3 nearest neighbors to create a clean city grid
for i in range(len(landmarks)):
    distances = []
    for j in range(len(landmarks)):
        if i != j:
            p1 = fixed_positions[landmarks[i]]
            p2 = fixed_positions[landmarks[j]]
            dist = ((p1[0] - p2[0])**2 + (p1[2] - p2[2])**2) ** 0.5
            distances.append((dist, j))
    distances.sort()
    for k in range(3):
        neighbor_idx = distances[k][1]
        dist = distances[k][0]
        capacity = random.randint(10, 30)
        G.add_edge(landmarks[i], landmarks[neighbor_idx], distance=dist, capacity=capacity)

async def tick_loop():
    global waste_counter
    while True:
        await asyncio.sleep(1)
        current_time = int(time.time())
        # Check top of heap
        while food_batches and food_batches[0].expiry_time <= current_time:
            heapq.heappop(food_batches)
            waste_counter += 1

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(tick_loop())

@app.get("/api/map")
def get_map():
    # Convert graph data to a JSON serializable format
    nodes = [{"id": n, "pos": d["pos"], "type": d["type"], "supply": d["supply"], "demand": d["demand"]} for n, d in G.nodes(data=True)]
    edges = [{"source": u, "target": v, "distance": d["distance"], "capacity": d["capacity"]} for u, v, d in G.edges(data=True)]
    return {"nodes": nodes, "edges": edges}

@app.get("/api/distribute")
def distribute_food():
    # Run the Edmonds-Karp algorithm manually
    start_time = time.perf_counter()
    result = run_edmonds_karp(G)
    end_time = time.perf_counter()
    result["time_ms"] = round((end_time - start_time) * 1000, 2)
    return result

@app.get("/api/perishables")
def get_perishables():
    # Return sorted (by urgency) list of food batches and the waste counter
    sorted_batches = sorted(food_batches)
    return {
        "batches": [b.to_dict() for b in sorted_batches],
        "waste_counter": waste_counter,
        "total_generated": total_generated,
        "total_delivered": total_delivered
    }

@app.get("/api/navigate")
def navigate(start: str, end: str):
    start_time = time.perf_counter()
    result = a_star_search(G, start, end)
    end_time = time.perf_counter()
    result["time_ms"] = round((end_time - start_time) * 1000, 2)
    return result

@app.post("/api/stress_test")
def stress_test():
    global batch_counter, total_generated
    restaurants = [n for n, d in G.nodes(data=True) if d['type'] == 'Restaurant']
    if not restaurants: return {"status": "No restaurants found"}
    
    for _ in range(5):
        donor = random.choice(restaurants)
        supply = random.randint(20, 100)
        expiry = int(time.time()) + random.randint(15, 60)
        batch = FoodBatch(expiry, batch_counter, supply, donor)
        heapq.heappush(food_batches, batch)
        total_generated += supply
        batch_counter += 1
    return {"status": "success"}

@app.post("/api/execute_delivery")
def execute_delivery(batch_id: int):
    global total_delivered
    for i, batch in enumerate(food_batches):
        if batch.batch_id == batch_id:
            total_delivered += batch.quantity
            # Remove from list and re-heapify
            food_batches.pop(i)
            heapq.heapify(food_batches)
            return {"status": "success"}
    return {"status": "not_found"}
