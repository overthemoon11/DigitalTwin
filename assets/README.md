# 3D Assets

This folder contains GLB/glTF files for the building visualisation.

## Current Status

The demo is **fully functional** with both procedural geometry and custom GLB assets:

### UI Graphics (Complete)
- **SVG Icons**: All UI components use custom SVG icons defined in `frontend/src/components/Icons.jsx`
- **Favicon & Logo**: Brand assets in `frontend/public/` (favicon.svg, logo.svg)
- **CSS Styling**: Comprehensive styling in `frontend/src/App.css`

### 3D Visualisation

#### GLB Model (Complete)
The building GLB model has been generated using Blender and includes:
- **Building shell**: 3-floor office building (60m x 40m, total height 11m)
- **Floor plates**: Each floor with proper positioning
- **Zone volumes**: Semi-transparent boxes for all HVAC zones
- **HVAC Equipment**: AHUs, Chiller, Boiler, Pumps with proper materials
- **VAV Boxes**: Terminal units in each zone
- **Ductwork**: Simplified main and branch ducts

Files:
- `building.glb` - Complete building model (87 KB)
- `generate_building.py` - Blender Python script to regenerate assets

#### Procedural Geometry (Fallback)
The frontend also supports procedural geometry generated from the twin state JSON, used as fallback if GLB is not available.

## Regenerating Assets

To regenerate the building model:

```powershell
# Run in PowerShell
& "C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" --background --python generate_building.py
```

Or adjust paths for your Blender installation.

## Asset Naming Convention

All mesh names in the GLB match the `meshId` field in `twin.state.json`:

| Asset Type | meshId | Description |
|------------|--------|-------------|
| Building Shell | Building_Shell | Main building exterior |
| Floor 1 | Floor_1 | Ground floor plate |
| Floor 2 | Floor_2 | Second floor plate |
| Floor 3 | Floor_3 | Third floor plate |
| Lobby Zone | Zone_Lobby | Main lobby area |
| Mechanical Room | Zone_Mechanical | Equipment room |
| Office F2 | Zone_Office_F2 | Floor 2 open office |
| Meeting Room A | Zone_Meeting_A | Conference room |
| Meeting Room B | Zone_Meeting_B | Conference room |
| Office F3 | Zone_Office_F3 | Floor 3 open office |
| Executive Suite | Zone_Executive | Executive area |
| AHU-1 | AHU_001 | Air handling unit 1 |
| AHU-2 | AHU_002 | Air handling unit 2 |
| Chiller | Chiller_001 | 200-ton chiller |
| Boiler | Boiler_001 | 2M BTU boiler |
| CHW Pump | Pump_CHW_001 | Chilled water pump |
| HW Pump | Pump_HW_001 | Hot water pump |
| VAV boxes | VAV_001_01, etc. | Variable air volume terminals |

## Customising the Model

To modify the 3D model:

1. Open `generate_building.py` in a text editor
2. Modify dimensions, colours, or positions
3. Re-run the script in Blender
4. Copy the new `building.glb` to `frontend/public/assets/`

Or use Blender interactively:
1. Open Blender
2. Run the script from the Text Editor
3. Make manual adjustments
4. Export as GLB to this folder

See `docs/blender-mcp-pipeline.md` for detailed modelling instructions.
