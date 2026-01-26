import React, { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Box, Text, Sphere, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';

// Check if GLB model exists
const GLB_PATH = '/assets/building.glb';

// Preload the GLB model
try {
  useGLTF.preload(GLB_PATH);
} catch (e) {
  console.log('GLB model not available, using procedural geometry');
}

// Color mapping for zone status
const getZoneColor = (temp, co2, status) => {
  if (status === 'alarm') return '#ff4444';
  if (status === 'warning') return '#ffaa00';
  
  // Temperature-based coloring (blue=cool, green=comfortable, red=warm)
  if (temp < 70) return '#4488ff';
  if (temp > 76) return '#ff6644';
  return '#44cc44';
};

// Get CO2 indicator color
const getCO2Color = (co2) => {
  if (co2 > 1000) return '#ff4444';
  if (co2 > 800) return '#ffaa00';
  return '#44cc44';
};

function ZoneBox({ zone, telemetry, alerts, isSelected, onClick }) {
  const meshRef = useRef();
  const { position, scale } = useMemo(() => {
    const pos = zone.pose?.position || { x: 0, y: 0, z: 0 };
    const props = zone.properties || {};
    const area = props.area || 1000;
    const height = props.height || 10;
    const size = Math.sqrt(area / 100);
    
    return {
      position: [pos.x, pos.y + height/2, pos.z],
      scale: [size, height, size]
    };
  }, [zone]);
  
  const temp = telemetry.find(t => t.assetId === zone.id && t.pointType === 'temperature')?.value || 72;
  const co2 = telemetry.find(t => t.assetId === zone.id && t.pointType === 'co2')?.value || 400;
  const hasAlert = alerts.some(a => a.assetId === zone.id && !a.resolved);
  
  const color = getZoneColor(temp, co2, hasAlert ? 'warning' : zone.status);
  
  useFrame((state) => {
    if (meshRef.current && isSelected) {
      meshRef.current.material.opacity = 0.6 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
    }
  });
  
  return (
    <group position={position}>
      <Box
        ref={meshRef}
        args={[1, 1, 1]}
        scale={scale}
        onClick={(e) => { e.stopPropagation(); onClick(zone.id); }}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.7 : 0.4}
          wireframe={false}
        />
      </Box>
      
      {/* Zone label */}
      <Text
        position={[0, scale[1]/2 + 2, 0]}
        fontSize={2}
        color="white"
        anchorX="center"
        anchorY="bottom"
      >
        {zone.name.split(' - ')[0]}
      </Text>
      
      {/* Temperature indicator */}
      <Text
        position={[0, scale[1]/2 + 0.5, 0]}
        fontSize={1.5}
        color={color}
        anchorX="center"
        anchorY="bottom"
      >
        {temp.toFixed(1)}°F
      </Text>
      
      {/* CO2 indicator sphere */}
      <Sphere
        args={[0.8, 16, 16]}
        position={[scale[0]/2 + 1, scale[1]/2, 0]}
      >
        <meshStandardMaterial color={getCO2Color(co2)} />
      </Sphere>
      
      {/* Alert indicator */}
      {hasAlert && (
        <Sphere
          args={[1, 16, 16]}
          position={[-scale[0]/2 - 1, scale[1]/2, 0]}
        >
          <meshStandardMaterial color="#ff4444" emissive="#ff0000" emissiveIntensity={0.5} />
        </Sphere>
      )}
    </group>
  );
}

function AHUBox({ ahu, telemetry, isSelected, onClick }) {
  const pos = ahu.pose?.position || { x: 32, y: 2, z: 5 };
  
  const power = telemetry.find(t => t.assetId === ahu.id && t.pointType === 'power')?.value || 0;
  
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <Box
        args={[8, 4, 5]}
        onClick={(e) => { e.stopPropagation(); onClick(ahu.id); }}
      >
        <meshStandardMaterial
          color={isSelected ? '#00aaff' : '#666688'}
          metalness={0.5}
          roughness={0.3}
        />
      </Box>
      <Text
        position={[0, 3, 0]}
        fontSize={1.2}
        color="white"
        anchorX="center"
      >
        {ahu.name.split(' ')[0]}
      </Text>
      <Text
        position={[0, 1.5, 2.6]}
        fontSize={1}
        color="#88ff88"
        anchorX="center"
      >
        {power.toFixed(1)} kW
      </Text>
    </group>
  );
}

function ChillerBox({ chiller, telemetry, isSelected, onClick }) {
  const pos = chiller.pose?.position || { x: 35, y: 0, z: 10 };
  
  const load = telemetry.find(t => t.assetId === chiller.id && t.pointType === 'chillerLoad')?.value || 0;
  
  return (
    <group position={[pos.x, pos.y + 3, pos.z]}>
      <Box
        args={[6, 6, 4]}
        onClick={(e) => { e.stopPropagation(); onClick(chiller.id); }}
      >
        <meshStandardMaterial
          color={isSelected ? '#00ccff' : '#4488aa'}
          metalness={0.6}
          roughness={0.2}
        />
      </Box>
      <Text
        position={[0, 4, 0]}
        fontSize={1.2}
        color="white"
        anchorX="center"
      >
        Chiller
      </Text>
      <Text
        position={[0, 2.5, 2.1]}
        fontSize={1}
        color="#88ffff"
        anchorX="center"
      >
        {(load * 100).toFixed(0)}% Load
      </Text>
    </group>
  );
}

function BoilerBox({ boiler, telemetry, isSelected, onClick }) {
  const pos = boiler.pose?.position || { x: 38, y: 0, z: 10 };
  
  return (
    <group position={[pos.x, pos.y + 2.5, pos.z]}>
      <Box
        args={[4, 5, 3]}
        onClick={(e) => { e.stopPropagation(); onClick(boiler.id); }}
      >
        <meshStandardMaterial
          color={isSelected ? '#ffaa00' : '#aa6644'}
          metalness={0.4}
          roughness={0.4}
        />
      </Box>
      <Text
        position={[0, 3.5, 0]}
        fontSize={1}
        color="white"
        anchorX="center"
      >
        Boiler
      </Text>
    </group>
  );
}

function FloorPlate({ floor, yPosition }) {
  return (
    <Box
      args={[60, 0.5, 40]}
      position={[20, yPosition, 10]}
    >
      <meshStandardMaterial
        color="#334455"
        transparent
        opacity={0.3}
      />
    </Box>
  );
}

// GLB Model Component - loads the Blender-generated building model
function GLBModel({ assets, telemetry, alerts, selectedAsset, onSelectAsset }) {
  const { scene } = useGLTF(GLB_PATH);
  const modelRef = useRef();
  
  // Clone the scene so we can modify it
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    
    // Make all meshes interactive
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Make materials responsive
        if (child.material) {
          child.material = child.material.clone();
          child.material.transparent = true;
        }
      }
    });
    
    return clone;
  }, [scene]);
  
  // Update zone colors based on telemetry
  useEffect(() => {
    if (!clonedScene) return;
    
    assets.forEach(asset => {
      if (!asset.meshId) return;
      
      const mesh = clonedScene.getObjectByName(asset.meshId);
      if (!mesh || !mesh.material) return;
      
      // Get telemetry for this asset
      const temp = telemetry.find(t => t.assetId === asset.id && t.pointType === 'temperature')?.value;
      const co2 = telemetry.find(t => t.assetId === asset.id && t.pointType === 'co2')?.value;
      const hasAlert = alerts.some(a => a.assetId === asset.id && !a.resolved);
      
      // Update opacity for selected items
      if (selectedAsset === asset.id) {
        mesh.material.opacity = 0.9;
        mesh.material.emissive = new THREE.Color(0x4488ff);
        mesh.material.emissiveIntensity = 0.3;
      } else {
        mesh.material.opacity = asset.type === 'zone' ? 0.5 : 0.9;
        mesh.material.emissive = new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = 0;
      }
      
      // Color zones based on temperature
      if (asset.type === 'zone' && temp) {
        const color = getZoneColor(temp, co2 || 400, hasAlert ? 'warning' : asset.status);
        mesh.material.color = new THREE.Color(color);
      }
      
      // Highlight equipment with alerts
      if (hasAlert) {
        mesh.material.emissive = new THREE.Color(0xff4444);
        mesh.material.emissiveIntensity = 0.5;
      }
    });
  }, [clonedScene, assets, telemetry, alerts, selectedAsset]);
  
  // Handle click events
  const handleClick = (event) => {
    event.stopPropagation();
    
    const clickedMesh = event.object;
    const asset = assets.find(a => a.meshId === clickedMesh.name);
    
    if (asset) {
      onSelectAsset(asset.id);
    }
  };
  
  return (
    <group ref={modelRef} onClick={handleClick}>
      <primitive object={clonedScene} />
      
      {/* Add floating labels and indicators for zones */}
      {assets.filter(a => a.type === 'zone' && a.properties?.zoneType !== 'mechanical').map(zone => {
        const temp = telemetry.find(t => t.assetId === zone.id && t.pointType === 'temperature')?.value || 72;
        const co2 = telemetry.find(t => t.assetId === zone.id && t.pointType === 'co2')?.value || 400;
        const pos = zone.pose?.position || { x: 0, y: 0, z: 0 };
        const height = zone.properties?.height || 10;
        
        return (
          <group key={zone.id} position={[pos.x, pos.y + height + 2, pos.z]}>
            <Text
              fontSize={1.5}
              color="white"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.1}
              outlineColor="#000000"
            >
              {zone.name.split(' - ')[0]}
            </Text>
            <Text
              position={[0, -1.5, 0]}
              fontSize={1.2}
              color={getZoneColor(temp, co2, zone.status)}
              anchorX="center"
              outlineWidth={0.08}
              outlineColor="#000000"
            >
              {temp.toFixed(1)}°F | {co2} ppm
            </Text>
          </group>
        );
      })}
    </group>
  );
}

// Loading fallback for GLB model
function GLBLoadingFallback() {
  return (
    <Html center>
      <div style={{
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '20px',
        borderRadius: '8px',
        fontFamily: 'system-ui'
      }}>
        Loading 3D Model...
      </div>
    </Html>
  );
}

function BuildingScene({ assets, telemetry, alerts, selectedAsset, onSelectAsset, useGLBModel = true }) {
  const [glbAvailable, setGlbAvailable] = useState(false);
  const [glbError, setGlbError] = useState(false);
  
  // Check if GLB model is available
  useEffect(() => {
    if (useGLBModel) {
      fetch(GLB_PATH, { method: 'HEAD' })
        .then(response => {
          setGlbAvailable(response.ok);
        })
        .catch(() => {
          setGlbAvailable(false);
          setGlbError(true);
        });
    }
  }, [useGLBModel]);
  
  const zones = assets.filter(a => a.type === 'zone' && a.properties?.zoneType !== 'mechanical');
  const ahus = assets.filter(a => a.type === 'ahu');
  const chillers = assets.filter(a => a.type === 'chiller');
  const boilers = assets.filter(a => a.type === 'boiler');
  const floors = assets.filter(a => a.type === 'floor');
  
  // Use GLB model if available and enabled
  if (useGLBModel && glbAvailable && !glbError) {
    return (
      <group>
        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[30, -0.5, 20]} receiveShadow>
          <planeGeometry args={[120, 100]} />
          <meshStandardMaterial color="#1a2030" />
        </mesh>
        
        <Suspense fallback={<GLBLoadingFallback />}>
          <GLBModel
            assets={assets}
            telemetry={telemetry}
            alerts={alerts}
            selectedAsset={selectedAsset}
            onSelectAsset={onSelectAsset}
          />
        </Suspense>
        
        {/* Grid helper */}
        <gridHelper args={[120, 24, '#333344', '#222233']} position={[30, 0.01, 20]} />
      </group>
    );
  }
  
  // Fallback to procedural geometry
  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, -0.5, 10]} receiveShadow>
        <planeGeometry args={[100, 80]} />
        <meshStandardMaterial color="#1a2030" />
      </mesh>
      
      {/* Floor plates */}
      {floors.map((floor, idx) => (
        <FloorPlate key={floor.id} floor={floor} yPosition={idx * 10} />
      ))}
      
      {/* Zones */}
      {zones.map(zone => (
        <ZoneBox
          key={zone.id}
          zone={zone}
          telemetry={telemetry}
          alerts={alerts}
          isSelected={selectedAsset === zone.id}
          onClick={onSelectAsset}
        />
      ))}
      
      {/* AHUs */}
      {ahus.map(ahu => (
        <AHUBox
          key={ahu.id}
          ahu={ahu}
          telemetry={telemetry}
          isSelected={selectedAsset === ahu.id}
          onClick={onSelectAsset}
        />
      ))}
      
      {/* Chillers */}
      {chillers.map(chiller => (
        <ChillerBox
          key={chiller.id}
          chiller={chiller}
          telemetry={telemetry}
          isSelected={selectedAsset === chiller.id}
          onClick={onSelectAsset}
        />
      ))}
      
      {/* Boilers */}
      {boilers.map(boiler => (
        <BoilerBox
          key={boiler.id}
          boiler={boiler}
          telemetry={telemetry}
          isSelected={selectedAsset === boiler.id}
          onClick={onSelectAsset}
        />
      ))}
      
      {/* Grid helper */}
      <gridHelper args={[100, 20, '#333344', '#222233']} position={[20, 0, 10]} />
    </group>
  );
}

export default BuildingScene;
