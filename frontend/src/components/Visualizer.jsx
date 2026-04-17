import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import axios from 'axios';
import * as THREE from 'three';

const Visualizer = () => {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [flowData, setFlowData] = useState(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const [perishables, setPerishables] = useState([]);
  const [deliveryPath, setDeliveryPath] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mapRes, perRes] = await Promise.all([
          axios.get('/api/map'),
          axios.get('/api/perishables')
        ]);
        setGraph(mapRes.data);
        setPerishables(perRes.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, []);

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
    } catch (error) {
      console.error('Error running distribution:', error);
    }
    setIsDistributing(false);
  };

  const handleSimulateDelivery = async () => {
    if (perishables.length === 0) return;
    
    const urgentBatch = perishables[0];
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
        }
      } catch (error) {
         console.error("Pathfinding error", error);
      }
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050505', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, color: 'white', fontFamily: 'sans-serif' }}>
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

      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, color: 'white', fontFamily: 'sans-serif', width: '300px', background: 'rgba(0,0,0,0.8)', padding: '20px', borderRadius: '10px', border: '1px solid #333' }}>
        <h2 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #555', paddingBottom: '10px' }}>Logistics Panel</h2>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#aaaaaa' }}>Urgent Food Batches</h3>
        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
          {perishables.slice(0, 5).map((batch, idx) => {
            const timeLeft = Math.max(0, Math.floor((batch.expiry_time - Date.now() / 1000) / 60));
            return (
              <div key={idx} style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '12px' }}>
                <strong>{batch.donor_id}</strong> - {batch.quantity} units<br/>
                <span style={{ color: timeLeft < 120 ? '#ff4444' : '#aaaaaa' }}>Expires in {timeLeft} mins</span>
              </div>
            );
          })}
        </div>
        <button 
          onClick={handleSimulateDelivery}
          style={{ width: '100%', padding: '10px', background: '#b026ff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Simulate Urgent Delivery
        </button>
      </div>

      <Canvas camera={{ position: [0, 15, 20], fov: 60 }}>
        <color attach="background" args={['#050505']} />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        
        <OrbitControls makeDefault />
        <gridHelper args={[50, 50, '#222222', '#111111']} />

        {/* Render Nodes */}
        {graph.nodes.map((node) => (
          <group key={node.id} position={node.pos}>
            <mesh>
              <sphereGeometry args={[0.5 + ((node.supply || node.demand || 0) / 100), 32, 32]} />
              <meshStandardMaterial 
                color={getNodeColor(node.type)} 
                emissive={getNodeColor(node.type)}
                emissiveIntensity={0.5}
                roughness={0.2}
                metalness={0.8}
              />
            </mesh>
            <Text
              position={[0, 1, 0]}
              fontSize={0.5}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.05}
              outlineColor="#000000"
            >
              {node.id}
            </Text>
          </group>
        ))}

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
            <Line
              key={index}
              points={[sourceNode.pos, targetNode.pos]}
              color={isFlowing ? "#ccff00" : "#ffffff"}
              lineWidth={isFlowing ? 3 : 1}
              opacity={isFlowing ? 1 : 0.3}
              transparent
            />
          );
        })}

        {/* Render Delivery Path */}
        {deliveryPath && (
          <Line
            points={deliveryPath}
            color="#b026ff" // Neon Purple
            lineWidth={5}
            opacity={1}
            transparent
          />
        )}
      </Canvas>
    </div>
  );
};

export default Visualizer;
