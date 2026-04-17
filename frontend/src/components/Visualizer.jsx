import React, { useEffect, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html, Trail, Edges } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import gsap from 'gsap';
import axios from 'axios';
import * as THREE from 'three';

const PulsingCore = ({ color }) => {
  const meshRef = useRef();
  useFrame((state) => {
    if (meshRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });
  return (
    <mesh ref={meshRef} position={[0, 0.5, 0]}>
      <icosahedronGeometry args={[0.4, 0]} />
      <meshBasicMaterial color={color} />
      <pointLight distance={10} intensity={2} color={color} />
    </mesh>
  );
};

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
        <mesh key={i} position={[b.xOff, b.height / 2, b.zOff]}>
          <boxGeometry args={[0.8, b.height, 0.8]} />
          <meshPhysicalMaterial 
            color="#113355" 
            transmission={0.9} 
            roughness={0.1} 
            thickness={2}
            transparent
            opacity={0.8}
          />
          <Edges color="#00ffff" opacity={0.3} transparent />
        </mesh>
      ))}

      <PulsingCore color={getNodeColor(node.type)} />
      
      {/* Diegetic Label */}
      <Line points={[[0, 0, 0], [0, 5, 0]]} color="#00ffff" opacity={0.2} transparent />
      <Html position={[0, 5, 0]} center>
        <div style={{ background: 'rgba(10, 15, 30, 0.8)', backdropFilter: 'blur(4px)', padding: '4px 8px', border: '1px solid rgba(0, 255, 255, 0.3)', color: '#00ffff', fontFamily: 'monospace', fontSize: '10px', whiteSpace: 'nowrap', borderRadius: '4px', boxShadow: '0 0 10px rgba(0, 255, 255, 0.2)' }}>
          {node.id}
        </div>
      </Html>
    </group>
  );
};

const DataStream = ({ start, end, isFlowing }) => {
  return (
    <group>
      {/* Faint base line */}
      <Line
        points={[start, end]}
        color="#00ffff"
        lineWidth={1.5}
        opacity={0.3}
        transparent
      />
      {/* Bright flowing line */}
      {isFlowing && (
        <Line
          points={[start, end]}
          color="#00ffff"
          lineWidth={3}
          toneMapped={false}
        />
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

    // Set truck to start position, locked strictly at y = 0.5
    meshRef.current.position.set(path[0][0], 0.5, path[0][2]);

    const tl = gsap.timeline();

    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      const prev = path[i - 1];
      const distance = Math.hypot(p[0] - prev[0], p[2] - prev[2]);
      const segmentDuration = distance * 0.2;

      tl.to(meshRef.current.position, {
        x: p[0],
        y: 0.5,
        z: p[2],
        duration: segmentDuration,
        ease: "sine.inOut"
      });
    }

    // Do NOT kill the timeline on unmount. The ref persists and killTweensOf handles cleanup.
  }, [path]);

  return (
    <Trail width={0.5} color="#b026ff" length={10} decay={1}>
      <mesh ref={meshRef}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshBasicMaterial color="#b026ff" />
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
            background: 'rgba(10, 15, 30, 0.7)',
            backdropFilter: 'blur(10px)',
            color: '#00ffff',
            border: '1px solid #00ffff',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold',
            boxShadow: '0 0 15px rgba(0, 255, 255, 0.3)'
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

      <div style={{ position: 'absolute', right: 20, top: 20, width: '300px', background: 'rgba(10, 15, 30, 0.8)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0, 255, 255, 0.3)', borderRadius: '10px', padding: '20px', zIndex: 10, color: '#e0ffff', boxShadow: '0 0 20px rgba(0, 255, 255, 0.15)' }}>
        <h2 style={{ margin: '0 0 15px 0', borderBottom: '1px solid rgba(0, 255, 255, 0.3)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
          Logistics
          <span style={{ color: '#ff4444', fontSize: '14px' }}>Waste: {perishablesData.waste_counter}</span>
        </h2>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#00ffff', textTransform: 'uppercase' }}>Urgent Food Batches</h3>
        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
          {perishablesData.batches.slice(0, 5).map((batch, idx) => {
            const timeLeft = Math.max(0, Math.floor((batch.expiry_time - Date.now() / 1000)));
            return (
              <div key={idx} style={{ padding: '8px', borderBottom: '1px solid rgba(0, 255, 255, 0.1)', fontSize: '12px' }}>
                <strong style={{ color: '#00ffff' }}>{batch.donor_id}</strong> - {batch.quantity} units<br />
                <span style={{ color: timeLeft < 30 ? '#ff4444' : '#88ccff' }}>Expires in {timeLeft} sec</span>
              </div>
            );
          })}
        </div>
        <button
          onClick={handleSimulateDelivery}
          style={{ width: '100%', padding: '10px', background: 'rgba(176, 38, 255, 0.8)', color: 'white', border: '1px solid #b026ff', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '10px', boxShadow: '0 0 10px rgba(176, 38, 255, 0.5)' }}
        >
          Simulate Urgent Delivery
        </button>
        <button
          onClick={handleStressTest}
          style={{ width: '100%', padding: '10px', background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 0 10px rgba(255, 68, 68, 0.2)' }}
        >
          Run Stress Test
        </button>
      </div>

      {/* Bottom Summary Dashboard */}
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, color: '#e0ffff', fontFamily: 'monospace', width: '600px', background: 'rgba(10, 15, 30, 0.8)', backdropFilter: 'blur(10px)', padding: '15px 30px', borderRadius: '10px', border: '1px solid rgba(0, 255, 255, 0.3)', boxShadow: '0 0 20px rgba(0, 255, 255, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#00ffff', textTransform: 'uppercase' }}>Efficiency Score</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#00ffff' }}>
            {perishablesData.total_generated > 0 ? Math.round((perishablesData.total_delivered / perishablesData.total_generated) * 100) : 0}%
          </div>
          <div style={{ fontSize: '12px', color: '#88ccff' }}>
            Delivered: {perishablesData.total_delivered} / Generated: {perishablesData.total_generated}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#00ffff', textTransform: 'uppercase' }}>Algorithm Performance</div>
          <div style={{ fontSize: '14px', margin: '4px 0' }}>Edmonds-Karp: <strong style={{ color: '#fff' }}>{algoStats.edmondsMs || 0} ms</strong></div>
          <div style={{ fontSize: '14px' }}>A* Search: <strong style={{ color: '#fff' }}>{algoStats.aStarMs || 0} ms</strong></div>
        </div>
      </div>

      <Canvas camera={{ position: [15, 10, 20], fov: 60 }} shadows={{ type: THREE.PCFShadowMap }}>
        <color attach="background" args={['#01020a']} />
        
        <ambientLight intensity={0.2} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={0.5}
        />
        
        <OrbitControls makeDefault />
        
        <gridHelper args={[100, 50, '#112233', '#050a10']} position={[0, -0.01, 0]} />

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
            <DataStream
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
          <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.5} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default Visualizer;
