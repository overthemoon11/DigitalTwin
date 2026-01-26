"""
Blender Python Script: Generate HVAC Digital Twin 3D Assets
Run this script in Blender to generate building.glb

Usage:
  blender --background --python generate_building.py
  
Or open Blender and run from Text Editor.
"""

import bpy
import math
import os

# Clear existing scene
def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    
    # Clear all meshes
    for mesh in bpy.data.meshes:
        bpy.data.meshes.remove(mesh)
    
    # Clear all materials
    for mat in bpy.data.materials:
        bpy.data.materials.remove(mat)

# Create material with color
def create_material(name, color, alpha=1.0, metallic=0.0, roughness=0.5, emission=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.blend_method = 'BLEND' if alpha < 1.0 else 'OPAQUE'
    
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Clear default nodes
    nodes.clear()
    
    # Create output node
    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (400, 0)
    
    # Create principled BSDF
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Alpha'].default_value = alpha
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    
    # Set emission if specified
    if emission > 0:
        bsdf.inputs['Emission Strength'].default_value = emission
        bsdf.inputs['Emission Color'].default_value = (*color, 1.0)
    
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    
    return mat

# Create a box mesh
def create_box(name, size, location, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    
    # Apply scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    
    # Assign material
    obj.data.materials.append(material)
    
    return obj

# Create a cylinder mesh
def create_cylinder(name, radius, height, location, material, segments=32):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius,
        depth=height,
        location=location,
        vertices=segments
    )
    obj = bpy.context.active_object
    obj.name = name
    
    # Assign material
    obj.data.materials.append(material)
    
    return obj

# Hex to RGB
def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))

# ============================================================================
# MAIN BUILDING GENERATION
# ============================================================================

def generate_building():
    clear_scene()
    
    # -------------------------------------------------------------------------
    # MATERIALS
    # -------------------------------------------------------------------------
    
    # Building shell - neutral gray
    mat_shell = create_material("Building_Shell_Mat", hex_to_rgb("445566"), alpha=0.9, roughness=0.7)
    
    # Floor plates - slightly different grays
    mat_floor1 = create_material("Floor_1_Mat", hex_to_rgb("556677"), roughness=0.8)
    mat_floor2 = create_material("Floor_2_Mat", hex_to_rgb("607080"), roughness=0.8)
    mat_floor3 = create_material("Floor_3_Mat", hex_to_rgb("556677"), roughness=0.8)
    
    # Zone materials - semi-transparent
    mat_zone_lobby = create_material("Zone_Lobby_Mat", hex_to_rgb("87CEEB"), alpha=0.4, roughness=0.3)
    mat_zone_mech = create_material("Zone_Mechanical_Mat", hex_to_rgb("555555"), alpha=0.3, roughness=0.6)
    mat_zone_office = create_material("Zone_Office_Mat", hex_to_rgb("90EE90"), alpha=0.4, roughness=0.3)
    mat_zone_meeting = create_material("Zone_Meeting_Mat", hex_to_rgb("FFFF99"), alpha=0.4, roughness=0.3)
    mat_zone_exec = create_material("Zone_Executive_Mat", hex_to_rgb("DDA0DD"), alpha=0.4, roughness=0.3)
    
    # Equipment materials
    mat_ahu = create_material("AHU_Mat", hex_to_rgb("4488AA"), metallic=0.3, roughness=0.4)
    mat_chiller = create_material("Chiller_Mat", hex_to_rgb("00AACC"), metallic=0.4, roughness=0.3, emission=0.1)
    mat_boiler = create_material("Boiler_Mat", hex_to_rgb("CC6644"), metallic=0.2, roughness=0.5, emission=0.15)
    mat_pump_chw = create_material("Pump_CHW_Mat", hex_to_rgb("3366CC"), metallic=0.5, roughness=0.3)
    mat_pump_hw = create_material("Pump_HW_Mat", hex_to_rgb("CC3333"), metallic=0.5, roughness=0.3)
    mat_vav = create_material("VAV_Mat", hex_to_rgb("888899"), metallic=0.6, roughness=0.4)
    mat_duct = create_material("Duct_Mat", hex_to_rgb("666666"), metallic=0.4, roughness=0.5)
    
    # -------------------------------------------------------------------------
    # BUILDING SHELL (60m x 40m, 3 floors)
    # -------------------------------------------------------------------------
    
    # Main building shell - wireframe style for visibility
    # Ground floor: 4m, upper floors: 3.5m each = total 11m
    total_height = 11.0
    
    # Create outer shell as a wireframe box
    create_box("Building_Shell", (60, 40, total_height), (30, 20, total_height/2), mat_shell)
    
    # -------------------------------------------------------------------------
    # FLOOR PLATES
    # -------------------------------------------------------------------------
    
    # Floor 1 (ground level)
    create_box("Floor_1", (60, 40, 0.3), (30, 20, 0.15), mat_floor1)
    
    # Floor 2 (at 4m)
    create_box("Floor_2", (60, 40, 0.3), (30, 20, 4.15), mat_floor2)
    
    # Floor 3 (at 7.5m)
    create_box("Floor_3", (60, 40, 0.3), (30, 20, 7.65), mat_floor3)
    
    # Roof plate
    create_box("Roof", (60, 40, 0.3), (30, 20, 11.15), mat_floor1)
    
    # -------------------------------------------------------------------------
    # ZONE VOLUMES
    # -------------------------------------------------------------------------
    
    # Zone_Lobby: Ground floor front (20m x 15m x 4m)
    create_box("Zone_Lobby", (20, 15, 3.7), (10, 7.5, 2.15), mat_zone_lobby)
    
    # Zone_Mechanical: Ground floor back corner (15m x 10m x 4m)
    create_box("Zone_Mechanical", (15, 12, 3.7), (52.5, 34, 2.15), mat_zone_mech)
    
    # Zone_Office_F2: Most of floor 2 (40m x 25m x 3.5m)
    create_box("Zone_Office_F2", (45, 30, 3.2), (22.5, 15, 5.9), mat_zone_office)
    
    # Zone_Meeting_A: Corner of floor 2 (8m x 8m x 3.5m)
    create_box("Zone_Meeting_A", (8, 8, 3.2), (50, 34, 5.9), mat_zone_meeting)
    
    # Zone_Meeting_B: Other corner of floor 2 (8m x 8m x 3.5m)
    create_box("Zone_Meeting_B", (8, 8, 3.2), (50, 6, 5.9), mat_zone_meeting)
    
    # Zone_Office_F3: Main area of floor 3 (35m x 20m x 3.5m)
    create_box("Zone_Office_F3", (40, 28, 3.0), (20, 14, 9.3), mat_zone_office)
    
    # Zone_Executive: Corner of floor 3 (15m x 12m x 3.5m)
    create_box("Zone_Executive", (15, 12, 3.0), (52.5, 34, 9.3), mat_zone_exec)
    
    # -------------------------------------------------------------------------
    # MECHANICAL EQUIPMENT
    # -------------------------------------------------------------------------
    
    # AHU-001: Large air handling unit (4m x 2m x 2.5m)
    ahu1 = create_box("AHU_001", (4, 2.5, 2.5), (48, 32, 1.55), mat_ahu)
    
    # Add duct on top of AHU-001
    create_box("AHU_001_Duct", (1, 0.8, 1.5), (48, 32, 3.55), mat_duct)
    
    # AHU-002: Smaller air handling unit (3m x 1.5m x 2m)
    ahu2 = create_box("AHU_002", (3, 2, 2), (48, 37, 1.3), mat_ahu)
    
    # Add duct on top of AHU-002
    create_box("AHU_002_Duct", (0.8, 0.6, 1.2), (48, 37, 2.9), mat_duct)
    
    # Chiller-001: Box with condenser on top (3m x 2m x 2.5m)
    chiller_base = create_box("Chiller_001", (3.5, 2.5, 2), (52, 30, 1.3), mat_chiller)
    
    # Condenser cylinder on top
    create_cylinder("Chiller_001_Condenser", 0.8, 1.2, (52, 30, 2.9), mat_chiller)
    
    # Boiler-001: Cylinder (radius 1m, height 2.5m)
    create_cylinder("Boiler_001", 1.0, 2.5, (56, 30, 1.55), mat_boiler)
    
    # Pump_CHW_001: Small cylinder
    create_cylinder("Pump_CHW_001", 0.35, 0.6, (50, 32, 0.6), mat_pump_chw)
    
    # Pump_CHW_002: Standby pump
    create_cylinder("Pump_CHW_002", 0.35, 0.6, (50, 34, 0.6), mat_pump_chw)
    
    # Pump_HW_001: Hot water pump
    create_cylinder("Pump_HW_001", 0.3, 0.5, (55, 32, 0.55), mat_pump_hw)
    
    # -------------------------------------------------------------------------
    # VAV BOXES (terminal units)
    # -------------------------------------------------------------------------
    
    # VAV_001_01: In lobby (near ceiling)
    create_box("VAV_001_01", (0.6, 0.4, 0.3), (10, 7.5, 3.55), mat_vav)
    
    # VAV_002_01: In office F2 (main VAV)
    create_box("VAV_002_01", (0.9, 0.6, 0.4), (22, 15, 7.1), mat_vav)
    
    # VAV_002_02: In meeting room A
    create_box("VAV_002_02", (0.5, 0.35, 0.25), (50, 34, 7.1), mat_vav)
    
    # VAV_002_03: In meeting room B
    create_box("VAV_002_03", (0.5, 0.35, 0.25), (50, 6, 7.1), mat_vav)
    
    # VAV_003_01: In office F3 (main VAV)
    create_box("VAV_003_01", (0.8, 0.5, 0.35), (20, 14, 10.5), mat_vav)
    
    # VAV_003_02: In executive suite
    create_box("VAV_003_02", (0.6, 0.4, 0.3), (52.5, 34, 10.5), mat_vav)
    
    # -------------------------------------------------------------------------
    # DUCTWORK (simplified)
    # -------------------------------------------------------------------------
    
    # Main supply duct from AHU-001 running along ceiling
    create_box("Duct_Main_F1", (30, 0.6, 0.4), (25, 25, 3.5), mat_duct)
    
    # Branch to lobby
    create_box("Duct_Branch_Lobby", (0.5, 10, 0.4), (10, 17, 3.5), mat_duct)
    
    # Main supply duct Floor 2
    create_box("Duct_Main_F2", (35, 0.6, 0.4), (27.5, 20, 7.05), mat_duct)
    
    # Branch ducts Floor 2
    create_box("Duct_Branch_F2_1", (0.5, 8, 0.4), (22, 11, 7.05), mat_duct)
    create_box("Duct_Branch_F2_2", (0.5, 6, 0.4), (50, 31, 7.05), mat_duct)
    create_box("Duct_Branch_F2_3", (0.5, 6, 0.4), (50, 9, 7.05), mat_duct)
    
    # Main supply duct Floor 3
    create_box("Duct_Main_F3", (30, 0.5, 0.35), (25, 20, 10.45), mat_duct)
    
    # Branch ducts Floor 3
    create_box("Duct_Branch_F3_1", (0.4, 8, 0.35), (20, 10, 10.45), mat_duct)
    create_box("Duct_Branch_F3_2", (0.4, 6, 0.35), (52.5, 31, 10.45), mat_duct)
    
    # -------------------------------------------------------------------------
    # FILTER BANKS (inside AHUs - represented as thin boxes)
    # -------------------------------------------------------------------------
    
    create_box("Filter_AHU_001", (0.15, 2.3, 2.3), (46.1, 32, 1.55), mat_ahu)
    create_box("Filter_AHU_002", (0.12, 1.8, 1.8), (46.6, 37, 1.3), mat_ahu)
    
    # -------------------------------------------------------------------------
    # SETUP SCENE
    # -------------------------------------------------------------------------
    
    # Add lights
    bpy.ops.object.light_add(type='SUN', location=(30, 20, 50))
    sun = bpy.context.active_object
    sun.name = "Sun"
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(45), math.radians(30), math.radians(0))
    
    # Add ambient light
    bpy.ops.object.light_add(type='AREA', location=(30, 20, 15))
    ambient = bpy.context.active_object
    ambient.name = "Ambient"
    ambient.data.energy = 500
    ambient.data.size = 40
    
    # Set camera position for good view
    bpy.ops.object.camera_add(location=(80, -30, 40))
    camera = bpy.context.active_object
    camera.name = "Camera"
    camera.rotation_euler = (math.radians(60), 0, math.radians(60))
    bpy.context.scene.camera = camera
    
    print("Building generation complete!")
    return True

# ============================================================================
# EXPORT
# ============================================================================

def export_glb(output_path):
    """Export scene as GLB with proper settings"""
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Select all mesh objects
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.select_set(True)
    
    # Export settings - Blender 5.0 compatible
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=False,  # Export all objects
        export_apply=True,    # Apply modifiers
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )
    
    print(f"Exported to: {output_path}")
    return True

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("HVAC Digital Twin - Building Asset Generator")
    print("=" * 60)
    
    # Generate the building
    generate_building()
    
    # Get script directory for output
    script_dir = os.path.dirname(os.path.realpath(__file__))
    output_file = os.path.join(script_dir, "building.glb")
    
    # Export
    export_glb(output_file)
    
    print("=" * 60)
    print("Generation complete!")
    print(f"Output: {output_file}")
    print("=" * 60)
