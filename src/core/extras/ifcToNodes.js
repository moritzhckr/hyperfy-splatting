import { createNode } from './createNode'
import * as THREE from './three'

// Color mapping for different IFC types
const ifcTypeColors = {
  // Structure
  IFCWALL: 0xf5e6d3, // Beige
  IFCWALLSTANDARDCASE: 0xf5e6d3,
  IFCSLAB: 0xe0e0e0, // Light gray
  IFCCOLUMN: 0xb0b0b0, // Medium gray
  IFCBEAM: 0x8b4513, // Brown
  IFCROOF: 0xa52a2a, // Dark red
  IFCSTAIR: 0x708090, // Slate gray
  IFCRAILING: 0x696969, // Dim gray

  // Openings
  IFCWINDOW: 0x87ceeb, // Sky blue
  IFCDOOR: 0x8b4513, // Saddle brown
  IFCOPENINGELEMENT: 0xffffff, // White

  // MEP
  IFCDUCTFITTING: 0x4169e1, // Royal blue
  IFCDUCTSEGMENT: 0x4682b4, // Steel blue
  IFCPIPEFITTING: 0x32cd32, // Lime green
  IFCPIPESEGMENT: 0x228b22, // Forest green

  // Furniture & Equipment
  IFCFURNISHINGELEMENT: 0xff8c00, // Dark orange
  IFCFURNITURE: 0xffa500, // Orange

  // Default
  DEFAULT: 0xcccccc, // Gray
}

/**
 * IFC to Nodes Converter
 *
 * Converts IFC models loaded by web-ifc-three into Hyperfy's node structure
 * Creates a hierarchical node structure with one node per IFC element
 */
export function ifcToNodes(ifcModel, world) {
  function getColorForIFCType(ifcType) {
    const type = ifcType?.toUpperCase()
    return ifcTypeColors[type] || ifcTypeColors.DEFAULT
  }

  function parse(object3ds, parentNode, createElementNodes = false) {
    for (const object3d of object3ds) {
      const props = object3d.userData || {}

      // IFC Mesh
      if (object3d.type === 'Mesh') {
        // Try to get material from userData (set by ClientLoader)
        let material = object3d.userData?.customMaterial || object3d.material

        console.log('[IFC] Processing Mesh:', {
          name: object3d.name,
          hasMaterial: !!material,
          hasCustomMaterial: !!object3d.userData?.customMaterial,
          customColor: object3d.userData?.customColor?.toString(16),
          materialType: material?.type,
          materialColor: material?.color?.getHexString(),
        })

        // If we have a custom color in userData but no valid material, create one
        if (object3d.userData?.customColor && (!material || !material.isMaterial)) {
          console.log('[IFC] Creating material from userData color:', object3d.userData.customColor.toString(16))
          material = new THREE.MeshStandardMaterial({
            color: object3d.userData.customColor,
            roughness: 0.5,
            metalness: 0.1,
          })
        }
        // Only create fallback material if nothing exists
        else if (!material || !material.isMaterial) {
          console.log('[IFC] No material found, creating fallback')
          material = new THREE.MeshStandardMaterial({
            color: 0xff0000, // Bright red for debugging
            roughness: 0.7,
            metalness: 0.1,
          })
        }

        const node = createNode('mesh', {
          id: object3d.name || `ifc_${object3d.expressID || object3d.uuid}`,
          type: 'geometry',
          geometry: object3d.geometry,
          material: material,
          linked: false, // IFC meshes should not be linked (each might have different materials)
          castShadow: props.castShadow !== false,
          receiveShadow: props.receiveShadow !== false,
          active: props.active !== false,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
      // Groups / Object3D
      else if (object3d.type === 'Group' || object3d.type === 'Object3D') {
        const node = createNode('group', {
          id: object3d.name || `ifc_group_${object3d.expressID || object3d.uuid}`,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
    }
  }

  const root = createNode('group', {
    id: '$root',
  })

  console.log('[IFC] Creating node hierarchy, ifcModel:', {
    type: ifcModel.type,
    hasChildren: ifcModel.children && ifcModel.children.length > 0,
    childrenCount: ifcModel.children?.length,
  })

  // Parse IFC model children
  if (ifcModel.children && ifcModel.children.length > 0) {
    console.log('[IFC] Parsing', ifcModel.children.length, 'children')
    parse(ifcModel.children, root)
  } else {
    // Fallback if model structure is different
    console.log('[IFC] Parsing ifcModel directly as single node')
    parse([ifcModel], root)
  }

  console.log('[IFC] Root node created with', root.children?.length || 0, 'children')

  return root
}
