import { createNode } from './createNode'
import * as THREE from './three'

// Material mapping for different IFC types
// Based on common IFC conventions and real-world materials
const ifcTypeMaterials = {
  // Structure - Walls (white/beige)
  IFCWALL: { color: 0xffffff, roughness: 0.8, metalness: 0.0, transparent: false },
  IFCWALLSTANDARDCASE: { color: 0xf5f5f0, roughness: 0.8, metalness: 0.0, transparent: false },
  
  // Structure - Floors/Slabs (light gray)
  IFCSLAB: { color: 0xe0e0e0, roughness: 0.7, metalness: 0.0, transparent: false },
  
  // Structure - Columns (medium gray)
  IFCCOLUMN: { color: 0xb0b0b0, roughness: 0.6, metalness: 0.1, transparent: false },
  
  // Structure - Beams (brown)
  IFCBEAM: { color: 0x8b4513, roughness: 0.7, metalness: 0.0, transparent: false },
  
  // Structure - Roof (dark red/brown)
  IFCROOF: { color: 0xa52a2a, roughness: 0.8, metalness: 0.0, transparent: false },
  
  // Structure - Stairs (slate gray)
  IFCSTAIR: { color: 0x708090, roughness: 0.6, metalness: 0.0, transparent: false },
  IFCRAILING: { color: 0x696969, roughness: 0.5, metalness: 0.2, transparent: false },
  
  // Openings - Windows (transparent glass with blue tint)
  IFCWINDOW: { color: 0x87ceeb, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.3 },
  
  // Openings - Doors (brown wood)
  IFCDOOR: { color: 0x8b4513, roughness: 0.7, metalness: 0.0, transparent: false },
  IFCOPENINGELEMENT: { color: 0xffffff, roughness: 0.6, metalness: 0.0, transparent: false },
  
  // MEP - Ducts (blue)
  IFCDUCTFITTING: { color: 0x4169e1, roughness: 0.4, metalness: 0.3, transparent: false },
  IFCDUCTSEGMENT: { color: 0x4682b4, roughness: 0.4, metalness: 0.3, transparent: false },
  
  // MEP - Pipes (green)
  IFCPIPEFITTING: { color: 0x32cd32, roughness: 0.4, metalness: 0.3, transparent: false },
  IFCPIPESEGMENT: { color: 0x228b22, roughness: 0.4, metalness: 0.3, transparent: false },
  
  // Furniture & Equipment
  IFCFURNISHINGELEMENT: { color: 0xff8c00, roughness: 0.6, metalness: 0.0, transparent: false },
  IFCFURNITURE: { color: 0xffa500, roughness: 0.6, metalness: 0.0, transparent: false },
  
  // Spaces (very transparent, just for visualization)
  IFCSPACE: { color: 0xffffff, roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.05 },
  
  // Default
  DEFAULT: { color: 0xcccccc, roughness: 0.6, metalness: 0.1, transparent: false },
}

// Helper function to get material for IFC type
// Following the same pattern as glbToNodes - NO setupMaterial here!
// Stage.createMaterial will handle CSM setup when the mesh mounts
function getMaterialForIFCType(ifcType, hasVertexColors = false) {
  if (!ifcType) {
    return getMaterialForIFCType('DEFAULT', hasVertexColors)
  }
  
  // Normalize type name
  let normalizedType = String(ifcType).toUpperCase()
  
  if (normalizedType.startsWith('IFCTYPE_')) {
    normalizedType = 'DEFAULT'
  } else if (!normalizedType.startsWith('IFC')) {
    normalizedType = 'IFC' + normalizedType
  }
  
  const materialConfig = ifcTypeMaterials[normalizedType] || ifcTypeMaterials.DEFAULT
  
  // Create material with proper lighting settings
  const material = new THREE.MeshStandardMaterial({
    color: materialConfig.color,
    roughness: materialConfig.roughness,
    metalness: materialConfig.metalness,
    side: THREE.DoubleSide,
    transparent: materialConfig.transparent,
    opacity: materialConfig.opacity !== undefined ? materialConfig.opacity : 1.0,
    vertexColors: hasVertexColors,
    // Ensure environment lighting works
    envMapIntensity: 1.0,
    // Minimal ambient boost to prevent 100% black shadows
    // This simulates indirect light bouncing in the scene
    emissive: new THREE.Color(materialConfig.color).multiplyScalar(0.08),
    emissiveIntensity: 1.0,
  })
  
  // Force material update to ensure it picks up scene.environment
  material.needsUpdate = true
  
  return material
}

/**
 * IFC to Nodes Converter
 *
 * Converts IFC models loaded by ThatOpen Components into Hyperfy's node structure
 * Follows the same pattern as glbToNodes for consistency with Hyperfy architecture
 */
export function ifcToNodes(ifcModel, world) {
  let parsedCount = 0
  let skippedCount = 0
  
  function parse(object3ds, parentNode) {
    if (!object3ds || object3ds.length === 0) {
      return
    }
    
    for (const object3d of object3ds) {
      if (!object3d) {
        skippedCount++
        continue
      }
      
      // --- Handle InstancedMesh (ThatOpen Fragments) ---
      if (object3d.isInstancedMesh) {
         const count = object3d.count;
         if (count > 0) {
             const geometry = object3d.geometry;
             // Clone geometry for safety
             let safeGeometry = geometry;
             try { safeGeometry = geometry.clone(); } catch(e) {}
             
             // Handle IDs access
             let getID = (index) => null;
             if (object3d.ids) {
                if (Array.isArray(object3d.ids) || object3d.ids instanceof Uint32Array) {
                   getID = (i) => object3d.ids[i];
                } else if (object3d.ids instanceof Set) {
                   const idsArray = Array.from(object3d.ids);
                   getID = (i) => idsArray[i];
                }
             }
             // Fallback to userData expressIDs array if set by ThatOpenIFCLoader
             if (getID(0) === null && object3d.userData && Array.isArray(object3d.userData.expressIDs)) {
                getID = (i) => object3d.userData.expressIDs[i];
             }
             
             for (let i = 0; i < count; i++) {
                 const matrix = new THREE.Matrix4();
                 object3d.getMatrixAt(i, matrix);
                 
                 const position = new THREE.Vector3();
                 const quaternion = new THREE.Quaternion();
                 const scale = new THREE.Vector3();
                 matrix.decompose(position, quaternion, scale);
                 
                 const expressID = getID(i);
                 
                 // Determine Type & Material for this instance
                 const expressIDToType = ifcModel.userData?.ifcExpressIDToType || {};
                 const ifcType = expressID && expressIDToType[expressID] || null;
                 
               // Material selection logic
               let material = object3d.material;
               
               // CRITICAL: Hyperfy createNode only accepts single materials, not arrays!
               // If it's an array, extract the first valid material
               if (Array.isArray(material)) {
                  material = material.find(m => m && m.isMaterial) || null;
               }
               
               // Validate material
               if (material && !material.isMaterial) {
                  material = null;
               }
               
               // If no valid material, create one based on IFC type
               if (!material) {
                  material = getMaterialForIFCType(ifcType || 'DEFAULT', false);
               } else {
                  // Clone material and ensure proper lighting settings
                  try {
                     material = material.clone();
                     material.vertexColors = false;
                     material.side = THREE.DoubleSide;
                     material.envMapIntensity = 1.0;
                     // Add minimal ambient to prevent 100% black shadows
                     if (material.color) {
                        material.emissive = material.color.clone().multiplyScalar(0.08);
                        material.emissiveIntensity = 1.0;
                     }
                     material.needsUpdate = true;
                  } catch(e) {
                     material = getMaterialForIFCType(ifcType || 'DEFAULT', false);
                  }
               }
                 
                const uniqueSuffix = object3d.uuid.slice(0, 8) + '_' + i;
                const nodeID = `ifc_${expressID || 'inst'}_${uniqueSuffix}`;
                
                // Get props from userData for this instanced mesh
                const instanceProps = object3d.userData || {};
                
                // Transparent materials should NOT cast shadows
                const isTransparent = material && material.transparent === true;
                
                const node = createNode('mesh', {
                   id: nodeID,
                   type: 'geometry',
                   geometry: safeGeometry,
                   material: material,
                   linked: false, // IFC geometries don't work well with linked mode
                   position: position.toArray(),
                   quaternion: quaternion.toArray(),
                   scale: scale.toArray(),
                   castShadow: !isTransparent && (instanceProps.castShadow !== false),
                   receiveShadow: instanceProps.receiveShadow !== false,
                   active: instanceProps.active !== false,
                });
                 
                 // Set Metadata
                 if (!node.userData) node.userData = {};
                 node.userData.isIFCGeometry = true;
                 if (expressID) {
                    node.userData.expressID = expressID;
                    node.userData.ifcElement = true;
                 }
                 if (ifcType) node.userData.ifcType = ifcType;
                 if (ifcModel.userData?.ifcModelID) {
                    node.userData.ifcModelID = ifcModel.userData.ifcModelID;
                 }
                 
                 parsedCount++;
                 parentNode.add(node);
             }
         }
         continue; // Skip standard processing
      }

      const props = object3d.userData || {}

      // IFC Mesh - convert to Hyperfy mesh node
      if (object3d.type === 'Mesh') {
        const geometry = object3d.geometry
        if (!geometry || !geometry.attributes || !geometry.attributes.position) {
          parse(object3d.children, parentNode)
          return
        }
        
        // Ensure geometry has valid position attribute for raycasting
        const positionAttr = geometry.attributes.position
        if (!positionAttr || !positionAttr.array || positionAttr.array.length === 0) {
          parse(object3d.children, parentNode)
          return
        }
        
        // Extract expressID
        let expressID = null
        if (geometry.attributes.expressID?.array?.[0]) expressID = geometry.attributes.expressID.array[0]
        else if (geometry.attributes.express_id?.array?.[0]) expressID = geometry.attributes.express_id.array[0]
        else if (geometry.userData?.expressID) expressID = geometry.userData.expressID
        else if (object3d.userData?.expressID) expressID = object3d.userData.expressID
        else if (object3d.name) {
          const nameMatch = object3d.name.match(/(\d+)/)
          if (nameMatch) expressID = parseInt(nameMatch[1], 10)
        }

        // Get IFC type
        const expressIDToType = ifcModel.userData?.ifcExpressIDToType || {}
        const ifcType = expressID && expressIDToType[expressID] || 
                       object3d.userData?.ifcType || 
                       null

        // Material Strategy:
        // 1. Prefer existing material (from ThatOpen/Original IFC)
        // 2. Fallback to Type-based material if no material exists
        
        let material = object3d.material
        
        // CRITICAL: Hyperfy createNode only accepts single materials, not arrays!
        if (Array.isArray(material)) {
           material = material.find(m => m && m.isMaterial) || null;
        }
        
        // Validate material or try userData fallbacks
        if (!material || !material.isMaterial) {
           material = object3d.userData?.customMaterial || object3d.userData?.material || null;
        }
        
        // If still no valid material, create from Type
        if (!material || !material.isMaterial) {
           material = getMaterialForIFCType(ifcType || 'DEFAULT', false)
        } else {
           // Clone material and ensure proper lighting settings
           try {
             material = material.clone()
             material.vertexColors = false
             material.side = THREE.DoubleSide
             material.envMapIntensity = 1.0
             // Add minimal ambient to prevent 100% black shadows
             if (material.color) {
                material.emissive = material.color.clone().multiplyScalar(0.08)
                material.emissiveIntensity = 1.0
             }
             material.needsUpdate = true
           } catch (e) {
             material = getMaterialForIFCType(ifcType || 'DEFAULT', false)
           }
        }

        // Clone geometry for safety
        let safeGeometry = geometry
        try {
          safeGeometry = geometry.clone()
          if (!safeGeometry.attributes.position?.array) {
            safeGeometry = geometry
          }
        } catch (cloneErr) {
          safeGeometry = geometry
        }
        
        // Generate unique ID to prevent React key collisions
        const uniqueSuffix = object3d.uuid.slice(0, 8)
        const nodeID = object3d.name || (expressID ? `ifc_${expressID}_${uniqueSuffix}` : `ifc_mesh_${uniqueSuffix}`)
        
        // Transparent materials should NOT cast shadows (allows light through windows)
        const isTransparent = material && material.transparent === true
        
        const node = createNode('mesh', {
          id: nodeID,
          type: 'geometry',
          geometry: safeGeometry,
          material: material,
          linked: false, // IFC geometries don't work well with linked mode
          castShadow: !isTransparent && (props.castShadow !== false),
          receiveShadow: props.receiveShadow !== false,
          active: props.active !== false,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        
        // Store IFC metadata
        if (!node.userData) node.userData = {}
        node.userData.isIFCGeometry = true
        if (expressID) {
          node.userData.expressID = expressID
          node.userData.ifcElement = true
        }
        if (ifcType) {
          node.userData.ifcType = ifcType
        }
        if (ifcModel.userData?.ifcModelID) {
          node.userData.ifcModelID = ifcModel.userData.ifcModelID
        }

        parsedCount++
        parentNode.add(node)
        
        if (object3d.children && object3d.children.length > 0) {
          parse(object3d.children, node)
        }
      }
      // Groups / Object3D
      else if (object3d.type === 'Group' || object3d.type === 'Object3D') {
        const expressID = object3d.userData?.expressID || null
        const expressIDToType = ifcModel.userData?.ifcExpressIDToType || {}
        const ifcType = expressID && expressIDToType[expressID] || 
                       object3d.userData?.ifcType || 
                       null

        const uniqueSuffix = object3d.uuid.slice(0, 8)
        const nodeID = object3d.name || (expressID ? `ifc_group_${expressID}_${uniqueSuffix}` : `ifc_group_${uniqueSuffix}`)

        const node = createNode('group', {
          id: nodeID,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })

        if (!node.userData) node.userData = {}
        if (expressID) {
          node.userData.expressID = expressID
          node.userData.ifcElement = true
        }
        if (ifcType) {
          node.userData.ifcType = ifcType
        }
        if (ifcModel.userData?.ifcModelID) {
          node.userData.ifcModelID = ifcModel.userData.ifcModelID
        }

        parsedCount++
        parentNode.add(node)
        
        if (object3d.children && object3d.children.length > 0) {
          parse(object3d.children, node)
        }
      } else {
        skippedCount++
        if (object3d.children && object3d.children.length > 0) {
          parse(object3d.children, parentNode)
        }
      }
    }
  }

  const root = createNode('group', {
    id: '$root',
  })

  if (!root.userData) root.userData = {}
  
  // Copy type stats
  if (ifcModel.userData?.ifcTypeStats) {
    root.userData.ifcTypeStats = { ...ifcModel.userData.ifcTypeStats }
  }
  
  // Copy ID map
  if (ifcModel.userData?.ifcExpressIDToType) {
    root.userData.ifcExpressIDToType = { ...ifcModel.userData.ifcExpressIDToType }
  }
  
  root.userData.ifcModelID = ifcModel.userData?.ifcModelID || ifcModel.modelID || null
  
  console.log('[IFC] Root metadata stored')

  // Parse IFC model structure
  if (ifcModel.children && ifcModel.children.length > 0) {
    parse(ifcModel.children, root)
  } else if (ifcModel.type === 'Mesh' || (ifcModel.geometry && ifcModel.isMesh)) {
    parse([ifcModel], root)
  }
  
  console.log('[IFC] Converted to nodes:', parsedCount, 'items')

  return root
}
