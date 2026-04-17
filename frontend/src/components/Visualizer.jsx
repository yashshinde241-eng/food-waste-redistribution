import React, { useEffect, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html, Trail } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import gsap from 'gsap';
import axios from 'axios';
import * as THREE from 'three';

const CityBlock = ({ node, getNodeColor }) => {
  const getSeededRandom = (seed, offset) => {
    let x = Math.sin(seed.charCodeAt(0) + offset) * 10000;
    return x - Math.floor(x);
  };

  const buildingCount = node.type === 'Hub' ? 1 : 4;
  const buildings = Array.from({ length: buildingCount }).map((_, i) => {
    const height = 1 + getSeededRandom(node.id, i) * 3;
    const xOff = (getSeededRandom(node.id, i + 10) - 0.5) * 1.5;
    const zOff = (getSeededRandom(node.id, i + 20) - 0.5) * 1.5;
    return { height, xOff, zOff };
  });

  const maxHeightBuilding = buildings.reduce((max, b) => b.height > max.height ? b : max, buildings[0]);

  return (
    <group position={node.pos}>
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.xOff, b.height / 2, b.zOff]} castShadow receiveShadow>
          <boxGeometry args={[0.8, b.height, 0.8]} />
          <meshStandardMaterial color="#222222" roughness={1.0} />
        </mesh>
      ))}

      {/* Roof Neon Status Bar */}
      <mesh position={[maxHeightBuilding.xOff, maxHeightBuilding.height + 0.1, maxHeightBuilding.zOff]}>
        <boxGeometry args={[0.7, 0.1, 0.2]} />
        <meshStandardMaterial color={getNodeColor(node.type)} emissive={getNodeColor(node.type)} emissiveIntensity={2} toneMapped={false} />
      </mesh>

      {/* Diegetic Label */}
      <Line points={[[0, 0, 0], [0, 5, 0]]} color="white" opacity={0.2} transparent />
      <Html position={[0, 5, 0]} center>
        <div style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '4px 8px', border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontFamily: 'monospace', fontSize: '10px', whiteSpace: 'nowrap', borderRadius: '4px' }}>
          {node.id}
        </div>
      </Html>
    </group>
  );
};

const AsphaltRoad = ({ start, end, isFlowing }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const distance = Math.hypot(dx, dz);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;
  const angle = Math.atan2(dz, dx);

  return (
    <group position={[midX, 0.01, midZ]} rotation={[0, -angle, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[distance, 0.5]} />
        <meshStandardMaterial color="#e0ddd5" roughness={0.9} />
      </mesh>
      {isFlowing && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <planeGeometry args={[distance, 0.1]} />
          <meshStandardMaterial color="#b026ff" emissive="#b026ff" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
};

const Volunteer = ({ path }) => {
  const meshRef = useRef();

  useEffect(() => {
    if (!path || path.length < 2 || !meshRef.current) return;

    // Kill any existing animations to prevent snapping/blinking
    gsap.killTweensOf(meshRef.current.position);

    // Set truck to start position, locked strictly at y = 0.3
    meshRef.current.position.set(path[0][0], 0.3, path[0][2]);

    const tl = gsap.timeline();

    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      const prev = path[i - 1];
      const distance = Math.hypot(p[0] - prev[0], p[2] - prev[2]);
      const segmentDuration = distance * 0.2;

      tl.to(meshRef.current.position, {
        x: p[0],
        y: 0.3,
        z: p[2],
        duration: segmentDuration,
        ease: "sine.inOut"
      });
    }

    // Do NOT kill the timeline on unmount. The ref persists and killTweensOf handles cleanup.
  }, [path]);

  return (
    <Trail width={0.5} color={[2, 0.5, 4]} length={10} decay={1}>
      <mesh ref={meshRef}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshBasicMaterial color={[2, 0.5, 4]} />
      </mesh>
    </Trail>
  );
};

const PingRing = ({ position }) => {
  const meshRef = useRef();
  const [active, setActive] = useState(true);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.scale.x += delta * 5;
    meshRef.current.scale.y += delta * 5;
    meshRef.current.material.opacity -= delta * 0.5;
    if (meshRef.current.material.opacity <= 0) setActive(false);
  });

  if (!active) return null;

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.5, 0.6, 32]} />
      <meshBasicMaterial color={[0, 2, 4]} transparent opacity={1} depthWrite={false} />
    </mesh>
  );
};

const Visualizer = () => {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [flowData, setFlowData] = useState(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const [perishablesData, setPerishablesData] = useState({ batches: [], waste_counter: 0, total_generated: 0, total_delivered: 0 });
  const [deliveryPath, setDeliveryPath] = useState(null);
  const [algoStats, setAlgoStats] = useState({ aStarMs: 0, edmondsMs: 0 });
  const [pings, setPings] = useState([]);
  const prevBatchesRef = useRef([]);

  useEffect(() => {
    const fetchMap = async () => {
      try {
        const response = await axios.get('/api/map');
        setGraph(response.data);
      } catch (error) {
        console.error('Error fetching map data:', error);
      }
    };
    fetchMap();

    const fetchPerishables = async () => {
      try {
        const response = await axios.get('/api/perishables');
        setPerishablesData(response.data);
      } catch (error) {
        console.error('Error fetching perishables:', error);
      }
    };
    fetchPerishables();
    const interval = setInterval(fetchPerishables, 1000); // Tick loop
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const newBatches = perishablesData.batches.filter(b => !prevBatchesRef.current.some(pb => pb.batch_id === b.batch_id));
    if (newBatches.length > 0) {
      const newPings = newBatches.map(b => {
        const node = graph.nodes.find(n => n.id === b.donor_id);
        return { id: b.batch_id, pos: node ? node.pos : [0, 0, 0] };
      });
      setPings(prev => [...prev, ...newPings]);
    }
    prevBatchesRef.current = perishablesData.batches;
  }, [perishablesData.batches, graph.nodes]);

  const getNodeColor = (type) => {
    switch (type) {
      case 'Restaurant': return '#39ff14'; // Neon Green
      case 'Shelter': return '#00ffff';    // Neon Blue
      case 'Hub': return '#ff9900';        // Neon Orange
      default: return '#ffffff';
    }
  };

  const handleDistribute = async () => {
    setIsDistributing(true);
    try {
      const response = await axios.get('/api/distribute');
      setFlowData(response.data);
      setAlgoStats(prev => ({ ...prev, edmondsMs: response.data.time_ms }));
    } catch (error) {
      console.error('Error running distribution:', error);
    }
    setIsDistributing(false);
  };

  const handleSimulateDelivery = async () => {
    if (perishablesData.batches.length === 0) return;

    const urgentBatch = perishablesData.batches[0];
    const startNode = urgentBatch.donor_id;

    const startPos = graph.nodes.find(n => n.id === startNode)?.pos;
    const shelters = graph.nodes.filter(n => n.type === 'Shelter');

    if (!startPos || shelters.length === 0) return;

    let nearestShelter = null;
    let minDistance = Infinity;

    shelters.forEach(shelter => {
      const dist = Math.sqrt(
        Math.pow(startPos[0] - shelter.pos[0], 2) +
        Math.pow(startPos[1] - shelter.pos[1], 2) +
        Math.pow(startPos[2] - shelter.pos[2], 2)
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestShelter = shelter.id;
      }
    });

    if (nearestShelter) {
      try {
        const res = await axios.get(`/api/navigate?start=${startNode}&end=${nearestShelter}`);
        if (res.data && res.data.path.length > 0) {
          const pathPoints = res.data.path.map(nodeId => {
            return graph.nodes.find(n => n.id === nodeId).pos;
          });
          setDeliveryPath(pathPoints);
          setAlgoStats(prev => ({ ...prev, aStarMs: res.data.time_ms }));
          // Confirm delivery with backend
          await axios.post(`/api/execute_delivery?batch_id=${urgentBatch.batch_id}`);
        }
      } catch (error) {
        console.error("Pathfinding error", error);
      }
    }
  };

  const handleStressTest = async () => {
    try {
      await axios.post('/api/stress_test');
    } catch (error) {
      console.error("Stress test error", error);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050505', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, color: 'white', fontFamily: 'monospace' }}>
        <button
          onClick={handleDistribute}
          disabled={isDistributing}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            background: '#ccff00',
            color: 'black',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isDistributing ? 'Calculating...' : 'Run Distribution'}
        </button>
        {flowData && (
          <div style={{ marginTop: '20px', background: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: '5px', border: '1px solid #ccff00' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#ccff00' }}>Results</h3>
            <p style={{ margin: 0 }}>Total Food Distributed: <strong>{flowData.total_flow} units</strong></p>
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, color: 'white', fontFamily: 'monospace', width: '300px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(15px)', padding: '20px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 32px 0 rgba(0,0,0,0.3)' }}>
        <h2 style={{ margin: '0 0 15px 0', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
          Logistics
          <span style={{ color: '#ff4444', fontSize: '14px' }}>Waste: {perishablesData.waste_counter}</span>
        </h2>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#aaaaaa' }}>Urgent Food Batches</h3>
        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
          {perishablesData.batches.slice(0, 5).map((batch, idx) => {
            const timeLeft = Math.max(0, Math.floor((batch.expiry_time - Date.now() / 1000)));
            return (
              <div key={idx} style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '12px' }}>
                <strong>{batch.donor_id}</strong> - {batch.quantity} units<br />
                <span style={{ color: timeLeft < 30 ? '#ff4444' : '#aaaaaa' }}>Expires in {timeLeft} sec</span>
              </div>
            );
          })}
        </div>
        <button
          onClick={handleSimulateDelivery}
          style={{ width: '100%', padding: '10px', background: '#b026ff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '10px' }}
        >
          Simulate Urgent Delivery
        </button>
        <button
          onClick={handleStressTest}
          style={{ width: '100%', padding: '10px', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Run Stress Test
        </button>
      </div>

      {/* Bottom Summary Dashboard */}
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, color: 'white', fontFamily: 'monospace', width: '600px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(15px)', padding: '15px 30px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 32px 0 rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#aaaaaa', textTransform: 'uppercase' }}>Efficiency Score</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ccff00' }}>
            {perishablesData.total_generated > 0 ? Math.round((perishablesData.total_delivered / perishablesData.total_generated) * 100) : 0}%
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            Delivered: {perishablesData.total_delivered} / Generated: {perishablesData.total_generated}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#aaaaaa', textTransform: 'uppercase' }}>Algorithm Performance</div>
          <div style={{ fontSize: '14px', margin: '4px 0' }}>Edmonds-Karp: <strong style={{ color: '#fff' }}>{algoStats.edmondsMs || 0} ms</strong></div>
          <div style={{ fontSize: '14px' }}>A* Search: <strong style={{ color: '#fff' }}>{algoStats.aStarMs || 0} ms</strong></div>
        </div>
      </div>

      <Canvas camera={{ position: [20, 20, 20], fov: 60 }} shadows={{ type: THREE.PCFShadowMap }}>
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#0a0a0c', 10, 50]} />

        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        <OrbitControls makeDefault />

        <gridHelper args={[100, 50, '#333333', '#222222']} position={[0, 0.01, 0]} />

        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.9} metalness={0.2} />
        </mesh>

        {/* Render Nodes (Procedural Cities) */}
        {graph.nodes.map((node) => (
          <CityBlock key={node.id} node={node} getNodeColor={getNodeColor} />
        ))}

        {/* Render Pings */}
        {pings.map(ping => <PingRing key={ping.id} position={[ping.pos[0], 0.1, ping.pos[2]]} />)}

        {/* Render Edges */}
        {graph.edges.map((edge, index) => {
          const sourceNode = graph.nodes.find(n => n.id === edge.source);
          const targetNode = graph.nodes.find(n => n.id === edge.target);
          if (!sourceNode || !targetNode) return null;

          let isFlowing = false;
          if (flowData && flowData.flows) {
            isFlowing = flowData.flows.some(f =>
              (f.source === edge.source && f.target === edge.target) ||
              (f.source === edge.target && f.target === edge.source)
            );
          }

          return (
            <AsphaltRoad
              key={index}
              start={sourceNode.pos}
              end={targetNode.pos}
              isFlowing={isFlowing}
            />
          );
        })}

        {/* Render Delivery Path and Volunteer */}
        {deliveryPath && (
          <>
            <Line
              points={deliveryPath}
              color={[2, 0.5, 4]} // Neon Purple bloom
              lineWidth={5}
              opacity={0.8}
              transparent
              toneMapped={false}
            />
            <Volunteer path={deliveryPath} />
          </>
        )}

        <EffectComposer>
          <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} intensity={1.5} />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
          <Noise opacity={0.05} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default Visualizer;
