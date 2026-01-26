# Blender MCP Asset Pipeline

This document describes how to use Blender MCP (ahujasid/blender-mcp) to generate and export 3D assets for the HVAC Digital Twin.

## Asset Naming Convention

All mesh names in Blender must match the `meshId` field in `twin.state.json`:

| Asset Type | JSON meshId | Blender Object Name |
|------------|-------------|---------------------|
| Building Shell | Building_Shell | Building_Shell |
| Floor 1 | Floor_1 | Floor_1 |
| Floor 2 | Floor_2 | Floor_2 |
| Floor 3 | Floor_3 | Floor_3 |
| Lobby Zone | Zone_Lobby | Zone_Lobby |
| Mechanical Room | Zone_Mechanical | Zone_Mechanical |
| Office F2 | Zone_Office_F2 | Zone_Office_F2 |
| Meeting Room A | Zone_Meeting_A | Zone_Meeting_A |
| Meeting Room B | Zone_Meeting_B | Zone_Meeting_B |
| Office F3 | Zone_Office_F3 | Zone_Office_F3 |
| Executive Suite | Zone_Executive | Zone_Executive |
| AHU-1 | AHU_001 | AHU_001 |
| AHU-2 | AHU_002 | AHU_002 |
| Chiller | Chiller_001 | Chiller_001 |
| Boiler | Boiler_001 | Boiler_001 |
| VAV boxes | VAV_001_01, etc. | VAV_001_01, etc. |
| CHW Pump | Pump_CHW_001 | Pump_CHW_001 |
| HW Pump | Pump_HW_001 | Pump_HW_001 |

## Blender MCP Prompt Sequence

Use these prompts in sequence with Blender MCP to generate the building assets:

### Step 1: Create Building Shell

```
Create a simple 3-floor office building shell:
- Total footprint: 60m x 40m
- Floor heights: Ground floor 4m, upper floors 3.5m each
- Simple rectangular shape with flat roof
- Add floor plates at each level (thin boxes)
- Use a neutral gray material (#445566)
- Name the object "Building_Shell"
- Position at origin (0, 0, 0)
```

### Step 2: Create Floor Plates

```
Create 3 floor plate meshes:
- Each is a flat box: 60m x 40m x 0.3m
- Floor_1 at y=0
- Floor_2 at y=4m
- Floor_3 at y=7.5m
- Use slightly different gray tones
- Name them "Floor_1", "Floor_2", "Floor_3"
```

### Step 3: Create Zone Volumes

```
Create semi-transparent zone boxes to represent HVAC zones:

1. Zone_Lobby: 
   - Size: 20m x 15m x 4m
   - Position: (10, 2, 7.5) - ground floor front
   - Color: light blue, 40% opacity

2. Zone_Mechanical:
   - Size: 15m x 10m x 4m
   - Position: (45, 2, 5) - ground floor back corner
   - Color: dark gray, 30% opacity

3. Zone_Office_F2:
   - Size: 40m x 25m x 3.5m
   - Position: (20, 5.75, 12.5) - most of floor 2
   - Color: light green, 40% opacity

4. Zone_Meeting_A:
   - Size: 8m x 8m x 3.5m
   - Position: (50, 5.75, 5) - corner of floor 2
   - Color: light yellow, 40% opacity

5. Zone_Meeting_B:
   - Size: 8m x 8m x 3.5m
   - Position: (50, 5.75, 25) - other corner of floor 2
   - Color: light yellow, 40% opacity

6. Zone_Office_F3:
   - Size: 35m x 20m x 3.5m
   - Position: (17.5, 9.25, 10) - main area of floor 3
   - Color: light green, 40% opacity

7. Zone_Executive:
   - Size: 15m x 12m x 3.5m
   - Position: (45, 9.25, 6) - corner of floor 3
   - Color: light purple, 40% opacity

Use Principled BSDF with transmission for glass-like appearance.
```

### Step 4: Create Mechanical Equipment

```
Create HVAC equipment in the mechanical room:

1. AHU_001:
   - Box shape: 4m x 2m x 2.5m
   - Position: (42, 1.25, 8)
   - Color: industrial blue (#4488AA)
   - Add simple duct shapes extending from top

2. AHU_002:
   - Box shape: 3m x 1.5m x 2m
   - Position: (42, 1, 18)
   - Color: industrial blue (#4488AA)

3. Chiller_001:
   - Box shape: 3m x 2m x 2.5m
   - Position: (48, 1.25, 12)
   - Color: cyan (#00AACC)
   - Add cylindrical shape on top for condenser

4. Boiler_001:
   - Cylinder shape: radius 1m, height 2.5m
   - Position: (52, 1.25, 12)
   - Color: orange-red (#CC6644)

5. Pump_CHW_001:
   - Small cylinder: radius 0.3m, height 0.5m
   - Position: (46, 0.25, 12)
   - Color: blue (#3366CC)

6. Pump_HW_001:
   - Small cylinder: radius 0.3m, height 0.5m
   - Position: (50, 0.25, 14)
   - Color: red (#CC3333)
```

### Step 5: Create VAV Boxes

```
Create VAV terminal boxes as small cubes near zone ceilings:

1. VAV_001_01: 0.5m cube at (10, 3.5, 7.5) - in lobby
2. VAV_002_01: 0.8m cube at (20, 7, 12.5) - in office F2
3. VAV_002_02: 0.4m cube at (50, 7, 5) - in meeting A
4. VAV_002_03: 0.4m cube at (50, 7, 25) - in meeting B
5. VAV_003_01: 0.7m cube at (17.5, 10.5, 10) - in office F3
6. VAV_003_02: 0.5m cube at (45, 10.5, 6) - in executive

Use metallic gray material (#888899).
```

### Step 6: Add Simple Ductwork (Optional)

```
Create simplified ductwork as rectangular extrusions:
- From AHU_001, run rectangular ducts (0.6m x 0.4m) along ceiling
- Branch to each VAV location
- Use dark gray metallic material
- Group all ducts under empty named "Ductwork"
```

### Step 7: Export Settings

```
Export the scene as GLB with these settings:
- Format: glTF Binary (.glb)
- Export only selected: OFF (export all)
- Apply Modifiers: ON
- UVs: ON
- Normals: ON
- Materials: Export
- Compression: ON (Draco)
- Output path: assets/building.glb
```

## Manual Export Steps

If using Blender GUI:
1. Select all objects (A)
2. File → Export → glTF 2.0 (.glb)
3. Enable "Include > Selected Objects" if exporting specific items
4. Under "Mesh", enable Normals and UVs
5. Under "Data", enable Compression (Draco)
6. Save to `digitaltwin/assets/building.glb`

## Loading in Three.js

The frontend uses `@react-three/drei`'s `useGLTF` hook:

```jsx
import { useGLTF } from '@react-three/drei';

function BuildingModel() {
  const { scene } = useGLTF('/assets/building.glb');
  
  // Find meshes by name matching JSON asset.meshId
  const zoneLobby = scene.getObjectByName('Zone_Lobby');
  
  return <primitive object={scene} />;
}
```

## Placeholder Geometry

Until GLB files are created, the frontend uses procedural geometry based on zone dimensions from `twin.state.json`. The current implementation creates:
- Colored boxes for zones
- Simple boxes for AHUs, chiller, boiler
- Spheres for status indicators

This approach ensures the demo works without external assets while maintaining the correct asset ID mappings for when proper GLB files are added.
