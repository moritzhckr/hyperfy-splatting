import { createNode } from './createNode'
import * as THREE from './three'

// IFC Type Categories for filtering
export const IFC_CATEGORIES = {
  WALLS: ['IFCWALL', 'IFCWALLSTANDARDCASE'],
  FLOORS: ['IFCSLAB', 'IFCFLOOR', 'IFCCOVERING'],
  DOORS: ['IFCDOOR', 'IFCDOORSTANDARDCASE'],
  WINDOWS: ['IFCWINDOW', 'IFCWINDOWSTANDARDCASE'],
  STAIRS: ['IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAILING'],
  COLUMNS: ['IFCCOLUMN'],
  BEAMS: ['IFCBEAM'],
  ROOF: ['IFCROOF'],
  FURNITURE: ['IFCFURNISHINGELEMENT', 'IFCFURNITURE'],
  SPACES: ['IFCSPACE'],
}

// Building element types that should have geometry
const GEOMETRY_TYPES = new Set([
  'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE',
  'IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE',
  'IFCDOOR', 'IFCDOORSTANDARDCASE',
  'IFCWINDOW', 'IFCWINDOWSTANDARDCASE',
  'IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE',
  'IFCBEAM', 'IFCBEAMSTANDARDCASE',
  'IFCROOF', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAILING', 'IFCRAMP',
  'IFCCURTAINWALL', 'IFCPLATE', 'IFCMEMBER',
  'IFCFOOTING', 'IFCPILE',
  'IFCCOVERING', 'IFCOPENINGELEMENT',
  'IFCFURNISHINGELEMENT', 'IFCFURNITURE',
  'IFCBUILDINGELEMENTPROXY',
  'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWTERMINAL',
])

// Helper to check if type belongs to a category
export function isTypeInCategory(ifcType, category) {
  if (!ifcType || !IFC_CATEGORIES[category]) return false
  const normalized = String(ifcType).toUpperCase()
  return IFC_CATEGORIES[category].some(t => normalized === t || normalized.includes(t))
}

/**
 * Create default material for IFC type
 */
function createDefaultMaterial(ifcType) {
  const typeColors = {
    IFCWALL: 0xf5f5f0,
    IFCWALLSTANDARDCASE: 0xf5f5f0,
    IFCSLAB: 0xe0e0e0,
    IFCCOLUMN: 0xb0b0b0,
    IFCBEAM: 0x8b4513,
    IFCROOF: 0xa52a2a,
    IFCSTAIR: 0x708090,
    IFCRAILING: 0x696969,
    IFCWINDOW: 0x87ceeb,
    IFCDOOR: 0x8b4513,
    IFCFURNISHINGELEMENT: 0xff8c00,
    IFCFURNITURE: 0xffa500,
    IFCSPACE: 0xcccccc,
    IFCCOVERING: 0xdcdcdc,
    IFCFOOTING: 0x808080,
    IFCCURTAINWALL: 0x87ceeb,
    IFCPLATE: 0xc0c0c0,
    IFCMEMBER: 0xa0a0a0,
    DEFAULT: 0xcccccc,
  }
  
  const normalizedType = String(ifcType || 'DEFAULT').toUpperCase()
  const color = typeColors[normalizedType] || typeColors.DEFAULT
  const isTransparent = normalizedType === 'IFCWINDOW' || normalizedType === 'IFCSPACE'
  
  const material = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.7,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: isTransparent,
    opacity: isTransparent ? 0.3 : 1.0,
    envMapIntensity: 1.0,
    flatShading: false,
  })
  
  material.emissive = new THREE.Color(color).multiplyScalar(0.05)
  material.emissiveIntensity = 1.0
  material.needsUpdate = true
  
  return material
}

/**
 * Add collision geometry to IFC building elements (walls, floors, stairs, etc.)
 *
 * Traverses the IFC node hierarchy and adds RigidBody + Collider nodes
 * to all building elements for physics interaction.
 */
function addCollisionsToElements(root) {
  // Collect all building element nodes (walls, floors/slabs, stairs)
  const elementNodes = []
  root.traverse(node => {
    if (node.userData?.ifcType) {
      const ifcType = node.userData.ifcType
      if (isTypeInCategory(ifcType, 'WALLS') ||
          isTypeInCategory(ifcType, 'FLOORS') ||
          isTypeInCategory(ifcType, 'STAIRS')) {
        elementNodes.push(node)
      }
    }
  })

  if (elementNodes.length === 0) {
    console.log('[IFC→Collisions] No walls, floors or stairs found')
    return
  }

  console.log(`[IFC→Collisions] Adding collisions to ${elementNodes.length} elements...`)

  let colliderCount = 0
  let bodyCount = 0
  let wallCount = 0
  let floorCount = 0
  let stairCount = 0

  // Process each element node - create a separate rigidbody for each element
  for (const elementNode of elementNodes) {
    const elementColliders = []
    const ifcType = elementNode.userData.ifcType

    // Track element type for logging
    if (isTypeInCategory(ifcType, 'WALLS')) {
      wallCount++
    } else if (isTypeInCategory(ifcType, 'FLOORS')) {
      floorCount++
    } else if (isTypeInCategory(ifcType, 'STAIRS')) {
      stairCount++
    }

    // Find mesh children with geometry
    elementNode.traverse(child => {
      if (child.name === 'mesh' && child.geometry) {
        try {
          const collider = createNode('collider', {
            type: 'geometry',
            geometry: child.geometry,
            convex: false, // Use trimesh for accurate collisions
            layer: 'environment',
          })

          // Copy local transformation from mesh to collider
          // The mesh's position is already relative to its parent (elementNode)
          collider.position.copy(child.position)
          collider.quaternion.copy(child.quaternion)
          collider.scale.copy(child.scale)

          elementColliders.push(collider)
          colliderCount++
        } catch (err) {
          console.warn('[IFC→Collisions] Failed to create collider for element mesh:', err)
        }
      }
    })

    // Only create rigidbody if we have colliders for this element
    if (elementColliders.length > 0) {
      const body = createNode('rigidbody', {
        type: 'static',
      })

      // Add all colliders to this element's rigidbody
      for (const collider of elementColliders) {
        body.add(collider)
      }

      // Add rigidbody to element node
      elementNode.add(body)
      bodyCount++
    }
  }

  console.log(`[IFC→Collisions] Created ${bodyCount} rigidbodies with ${colliderCount} colliders (${wallCount} walls, ${floorCount} floors, ${stairCount} stairs)`)
}

/**
 * IFC to Nodes Converter
 *
 * Converts IFC model into Hyperfy's node structure with proper hierarchy.
 * Uses web-ifc to get geometry per building element.
 */
export function ifcToNodes(ifcModel, world) {
  const expressIDToType = ifcModel.userData?.ifcExpressIDToType || {}
  const typeStats = ifcModel.userData?.ifcTypeStats || {}
  const spatialStructure = ifcModel.userData?.ifcSpatialStructure
  const webIfc = ifcModel.userData?.webIfc
  const webIfcModelID = ifcModel.userData?.webIfcModelID
  const modelID = ifcModel.userData?.webIfcModelID ?? 0 // web-ifc model ID
  
  console.log('[IFC→Nodes] Converting...', Object.keys(typeStats).length, 'types')
  console.log('[IFC→Nodes] Has webIfc:', !!webIfc)
  console.log('[IFC→Nodes] webIfcModelID:', modelID)
  console.log('[IFC→Nodes] Has spatial structure:', !!spatialStructure)
  
  // Create root node
  const root = createNode('group', { id: '$root' })
  if (!root.userData) root.userData = {}
  root.userData.ifcTypeStats = { ...typeStats }
  root.userData.ifcExpressIDToType = { ...expressIDToType }
  
  let hierarchyNodeCount = 0
  let meshCount = 0
  
  /**
   * Get geometry for an expressID using web-ifc
   */
  function getGeometryForElement(expressID) {
    if (!webIfc) return null
    
    try {
      const flatMesh = webIfc.GetFlatMesh(modelID, expressID)
      if (!flatMesh || !flatMesh.geometries || flatMesh.geometries.size() === 0) {
        return null
      }
      
      // Combine all geometries for this element
      const positions = []
      const normals = []
      const indices = []
      let indexOffset = 0
      
      for (let i = 0; i < flatMesh.geometries.size(); i++) {
        const placedGeom = flatMesh.geometries.get(i)
        const geomData = webIfc.GetGeometry(modelID, placedGeom.geometryExpressID)
        
        if (!geomData) continue
        
        const verts = webIfc.GetVertexArray(geomData.GetVertexData(), geomData.GetVertexDataSize())
        const idx = webIfc.GetIndexArray(geomData.GetIndexData(), geomData.GetIndexDataSize())
        
        if (!verts || !idx || verts.length === 0) continue
        
        // Apply transformation matrix
        const matrix = new THREE.Matrix4()
        matrix.fromArray(placedGeom.flatTransformation)
        
        // Add vertices (position + normal interleaved, 6 floats per vertex)
        const vertexCount = verts.length / 6
        for (let v = 0; v < vertexCount; v++) {
          const px = verts[v * 6 + 0]
          const py = verts[v * 6 + 1]
          const pz = verts[v * 6 + 2]
          const nx = verts[v * 6 + 3]
          const ny = verts[v * 6 + 4]
          const nz = verts[v * 6 + 5]
          
          // Transform position
          const pos = new THREE.Vector3(px, py, pz)
          pos.applyMatrix4(matrix)
          positions.push(pos.x, pos.y, pos.z)
          
          // Transform normal
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)
          const norm = new THREE.Vector3(nx, ny, nz)
          norm.applyMatrix3(normalMatrix).normalize()
          normals.push(norm.x, norm.y, norm.z)
        }
        
        // Add indices with offset
        for (let j = 0; j < idx.length; j++) {
          indices.push(idx[j] + indexOffset)
        }
        
        indexOffset += vertexCount
      }
      
      if (positions.length === 0) return null
      
      // Create Three.js geometry
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
      geometry.setIndex(indices)
      
      return geometry
      
    } catch (e) {
      // Geometry not available for this element
      return null
    }
  }
  
  /**
   * Get all IFC properties for an element using web-ifc
   */
  function getElementProperties(expressID) {
    if (!webIfc || !expressID) return null
    
    try {
      const line = webIfc.GetLine(modelID, expressID)
      if (!line) return null
      
      const props = {}
      
      // Standard IFC attributes
      if (line.GlobalId?.value) props.globalId = line.GlobalId.value
      if (line.Name?.value) props.name = line.Name.value
      if (line.Description?.value) props.description = line.Description.value
      if (line.ObjectType?.value) props.objectType = line.ObjectType.value
      if (line.Tag?.value) props.tag = line.Tag.value
      if (line.PredefinedType?.value) props.predefinedType = line.PredefinedType.value
      if (line.OverallHeight?.value) props.height = line.OverallHeight.value
      if (line.OverallWidth?.value) props.width = line.OverallWidth.value
      if (line.ElevationOfRefHeight?.value) props.elevation = line.ElevationOfRefHeight.value
      if (line.LongName?.value) props.longName = line.LongName.value
      
      return Object.keys(props).length > 0 ? props : null
    } catch (e) {
      return null
    }
  }
  
  /**
   * Get property sets (Psets) for an element
   */
  function getPropertySets(expressID) {
    if (!webIfc || !expressID) return null
    
    try {
      // IFC type code for IFCRELDEFINESBYPROPERTIES
      const IFCRELDEFINESBYPROPERTIES = 4186316022
      
      const psets = {}
      const rels = webIfc.GetLineIDsWithType(modelID, IFCRELDEFINESBYPROPERTIES)
      
      for (let i = 0; i < rels.size(); i++) {
        const relId = rels.get(i)
        const rel = webIfc.GetLine(modelID, relId)
        
        if (!rel || !rel.RelatedObjects) continue
        
        // Check if this relation applies to our element
        let applies = false
        for (const obj of rel.RelatedObjects) {
          if (obj?.value === expressID) {
            applies = true
            break
          }
        }
        
        if (!applies) continue
        
        // Get the property set
        const psetRef = rel.RelatingPropertyDefinition
        if (!psetRef?.value) continue
        
        const pset = webIfc.GetLine(modelID, psetRef.value)
        if (!pset) continue
        
        const psetName = pset.Name?.value || 'Properties'
        psets[psetName] = {}
        
        // Get properties from the pset
        if (pset.HasProperties) {
          for (const propRef of pset.HasProperties) {
            if (!propRef?.value) continue
            const prop = webIfc.GetLine(modelID, propRef.value)
            if (!prop || !prop.Name?.value) continue
            
            const propName = prop.Name.value
            let propValue = null
            
            // Extract value based on property type
            if (prop.NominalValue?.value !== undefined) {
              propValue = prop.NominalValue.value
            } else if (prop.EnumerationValues) {
              propValue = prop.EnumerationValues.map(v => v?.value).filter(Boolean).join(', ')
            }
            
            if (propValue !== null) {
              psets[psetName][propName] = propValue
            }
          }
        }
        
        // Get quantities from quantity sets
        if (pset.Quantities) {
          for (const qRef of pset.Quantities) {
            if (!qRef?.value) continue
            const q = webIfc.GetLine(modelID, qRef.value)
            if (!q || !q.Name?.value) continue
            
            const qName = q.Name.value
            let qValue = null
            
            if (q.LengthValue?.value !== undefined) qValue = `${q.LengthValue.value.toFixed(3)} m`
            else if (q.AreaValue?.value !== undefined) qValue = `${q.AreaValue.value.toFixed(3)} m²`
            else if (q.VolumeValue?.value !== undefined) qValue = `${q.VolumeValue.value.toFixed(3)} m³`
            else if (q.CountValue?.value !== undefined) qValue = q.CountValue.value
            else if (q.WeightValue?.value !== undefined) qValue = `${q.WeightValue.value.toFixed(2)} kg`
            
            if (qValue !== null) {
              psets[psetName][qName] = qValue
            }
          }
        }
      }
      
      return Object.keys(psets).length > 0 ? psets : null
    } catch (e) {
      return null
    }
  }
  
  /**
   * Build hierarchy from IFC spatial structure, creating meshes for elements with geometry
   */
  function buildHierarchy(ifcNode, parentHyperfyNode, depth = 0) {
    if (!ifcNode) return
    
    const nodeType = (ifcNode.type || ifcNode.Category || 'UNKNOWN').toUpperCase()
    const nodeId = ifcNode.expressID || ifcNode.ExpressID || ifcNode.id || 0
    const nodeName = ifcNode.name || ifcNode.Name || ''
    
    // Create group node for this IFC element
    const groupNode = createNode('group', {
      id: `${nodeType}_${nodeId}`,
    })
    
    if (!groupNode.userData) groupNode.userData = {}
    groupNode.userData.expressID = nodeId
    groupNode.userData.ifcType = nodeType
    groupNode.userData.ifcElement = true
    if (nodeName) groupNode.userData.ifcName = nodeName
    
    // Get additional IFC properties
    const elementProps = getElementProperties(nodeId)
    if (elementProps) {
      groupNode.userData.ifcProperties = elementProps
    }
    
    // Get property sets (only for building elements to avoid performance issues)
    if (GEOMETRY_TYPES.has(nodeType)) {
      const psets = getPropertySets(nodeId)
      if (psets) {
        groupNode.userData.ifcPropertySets = psets
      }
    }
    
    hierarchyNodeCount++
    parentHyperfyNode.add(groupNode)
    
    // Check if this is a building element that should have geometry
    if (GEOMETRY_TYPES.has(nodeType) && nodeId) {
      const geometry = getGeometryForElement(nodeId)
      
      if (geometry) {
        const material = createDefaultMaterial(nodeType)
        const isTransparent = material.transparent === true
        
        const meshNode = createNode('mesh', {
          id: `mesh_${nodeId}`,
          type: 'geometry',
          geometry: geometry,
          material: material,
          linked: false,
          castShadow: !isTransparent,
          receiveShadow: true,
        })
        
        if (!meshNode.userData) meshNode.userData = {}
        meshNode.userData.isIFCGeometry = true
        meshNode.userData.expressID = nodeId
        meshNode.userData.ifcType = nodeType
        
        // Add mesh as child of the group node
        groupNode.add(meshNode)
        meshCount++
      }
    }
    
    // Process children
    const children = ifcNode.children || ifcNode.Children || []
    for (const child of children) {
      buildHierarchy(child, groupNode, depth + 1)
    }
  }
  
  // Build hierarchy with geometry
  if (spatialStructure) {
    console.log('[IFC→Nodes] Building hierarchy with geometry...')
    buildHierarchy(spatialStructure, root, 0)
  } else {
    console.log('[IFC→Nodes] No spatial structure, creating flat mesh list')
    // Fallback: just process the Three.js meshes
    let meshIndex = 0
    function processMesh(obj) {
      if (!obj.isMesh || !obj.geometry) return
      const geometry = obj.geometry
      if (!geometry.attributes?.position?.array?.length) return
      
      try {
        const clonedGeom = geometry.clone()
        const material = createDefaultMaterial('DEFAULT')
        
        const meshNode = createNode('mesh', {
          id: `mesh_${meshIndex++}`,
          type: 'geometry',
          geometry: clonedGeom,
          material: material,
          linked: false,
          castShadow: true,
          receiveShadow: true,
          position: obj.position?.toArray() || [0, 0, 0],
          quaternion: obj.quaternion?.toArray() || [0, 0, 0, 1],
          scale: obj.scale?.toArray() || [1, 1, 1],
        })
        
        root.add(meshNode)
        meshCount++
      } catch (e) {}
    }
    
    function traverse(obj) {
      if (obj.isMesh) processMesh(obj)
      if (obj.children) obj.children.forEach(traverse)
    }
    
    if (ifcModel.children) ifcModel.children.forEach(traverse)
  }
  
  console.log(`[IFC→Nodes] Done: ${hierarchyNodeCount} hierarchy + ${meshCount} mesh nodes`)

  // Store webIfc reference and original Three.js model in root for later use
  if (!root.userData) root.userData = {}
  root.userData.webIfc = webIfc
  root.userData.webIfcModelID = webIfcModelID
  root.userData.originalIfcModel = ifcModel // Store original Three.js model with fragments

  console.log('[IFC→Nodes] Stored originalIfcModel:', {
    hasIfcModel: !!ifcModel,
    hasObject: !!(ifcModel && ifcModel.object),
    ifcModelKeys: ifcModel ? Object.keys(ifcModel).filter(k => !k.startsWith('_')) : [],
    ifcModelType: ifcModel ? ifcModel.constructor.name : 'undefined'
  })

  // Add collision geometry to walls and floors
  addCollisionsToElements(root)

  // Add interactive actions to doors
  addInteractiveDoors(root)

  return root
}

/**
 * Add interactive actions to IFC doors
 *
 * Makes doors openable by adding Action nodes
 */
function addInteractiveDoors(root) {
  const doorNodes = []

  // Find all door nodes
  root.traverse(node => {
    if (node.userData?.ifcType) {
      const ifcType = node.userData.ifcType.toUpperCase()
      if (ifcType === 'IFCDOOR' || ifcType === 'IFCDOORSTANDARDCASE') {
        doorNodes.push(node)
      }
    }
  })

  if (doorNodes.length === 0) {
    console.log('[IFC→Doors] No doors found')
    return
  }

  console.log(`[IFC→Doors] Adding interaction to ${doorNodes.length} doors...`)

  // Get original IFC model from root
  const originalIfcModel = root.userData?.originalIfcModel

  console.log('[IFC→Doors] Retrieved originalIfcModel:', {
    hasOriginalIfcModel: !!originalIfcModel,
    hasChildren: !!(originalIfcModel && originalIfcModel.children),
    rootUserDataKeys: root.userData ? Object.keys(root.userData) : [],
    originalIfcModelType: originalIfcModel ? originalIfcModel.constructor.name : 'undefined'
  })

  if (!originalIfcModel) {
    console.warn('[IFC→Doors] Original IFC model not available, cannot get door positions')
    return
  }

  let actionCount = 0

  // Create actions group at root level
  const doorActionsGroup = createNode('group', {
    id: 'ifc_door_actions'
  })
  root.add(doorActionsGroup)

  for (let i = 0; i < doorNodes.length; i++) {
    const doorNode = doorNodes[i]

    try {
      // Store door metadata for the action handler
      doorNode.userData.doorState = {
        isOpen: false,
        originalRotation: doorNode.rotation.y,
        openAngle: 90 * (Math.PI / 180), // 90 degrees in radians
        direction: getDoorDirection(doorNode),
        doorNode: doorNode // Store reference for animation
      }

      // Get world position by finding meshes with this expressID in originalIfcModel.object
      const worldPos = findDoorMeshPosition(doorNode.userData.expressID, originalIfcModel)

      if (!worldPos) {
        console.warn(`[IFC→Doors] Door ${i} (${doorNode.userData.expressID}) - no valid position found, skipping`)
        continue
      }

      console.log(`[IFC→Doors] Door ${i} (${doorNode.userData.expressID}) position:`, worldPos)

      // Create a separate group for this door's action at root level
      const actionGroup = createNode('group', {
        id: `door_action_group_${i}`,
        position: [worldPos.x, worldPos.y + 1.0, worldPos.z] // +1m for handle height
      })

      // Create action node
      const action = createNode('action', {
        id: `door_action_${i}`,
        label: 'Open Door',
        distance: 2.5,
        duration: 0.1,
        position: [0, 0, 0], // Relative to action group
        onTrigger: createDoorToggleHandler(doorNode)
      })

      actionGroup.add(action)
      doorActionsGroup.add(actionGroup)

      // Store reference so we can update label
      doorNode.userData.doorState.actionNode = action

      actionCount++
    } catch (err) {
      console.warn('[IFC→Doors] Failed to create action for door:', err)
    }
  }

  console.log(`[IFC→Doors] Created ${actionCount} interactive doors with actions as children`)
  console.log('[IFC→Doors] NOTE: Actions inherit door node transforms, so they will move with the hierarchy')
}

/**
 * Get world position of a door from IFC data using web-ifc
 */
function getDoorPositionFromIFC(doorNode, webIfc, modelID) {
  try {
    const expressID = doorNode.userData.expressID
    if (!expressID || !webIfc || modelID === undefined) {
      console.warn('[IFC→Doors] Missing data to query door position:', { expressID, hasWebIfc: !!webIfc, modelID })
      return { x: 0, y: 0, z: 0 }
    }

    // Get the door element from web-ifc
    const doorElement = webIfc.GetLine(modelID, expressID)
    if (!doorElement) {
      console.warn('[IFC→Doors] Could not get door element:', expressID)
      return { x: 0, y: 0, z: 0 }
    }

    // Get ObjectPlacement
    const placementRef = doorElement.ObjectPlacement
    if (!placementRef || !placementRef.value) {
      return { x: 0, y: 0, z: 0 }
    }

    // Get the placement data
    const placement = webIfc.GetLine(modelID, placementRef.value)
    if (!placement) {
      return { x: 0, y: 0, z: 0 }
    }

    // For IfcLocalPlacement, we need to traverse up the placement hierarchy
    let matrix = getPlacementMatrix(placement, webIfc, modelID)

    // Extract position from the matrix (last column)
    return {
      x: matrix[12] || 0,
      y: matrix[13] || 0,
      z: matrix[14] || 0
    }
  } catch (err) {
    console.warn('[IFC→Doors] Error getting door position from IFC:', err)
    return { x: 0, y: 0, z: 0 }
  }
}

/**
 * Get placement matrix from IfcLocalPlacement recursively
 */
function getPlacementMatrix(placement, webIfc, modelID) {
  // Identity matrix
  let matrix = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]

  try {
    // Check if this is IfcLocalPlacement
    if (placement.constructor.name !== 'IfcLocalPlacement') {
      return matrix
    }

    // Get the relative placement
    const relPlacementRef = placement.RelativePlacement
    if (relPlacementRef && relPlacementRef.value) {
      const relPlacement = webIfc.GetLine(modelID, relPlacementRef.value)

      if (relPlacement && relPlacement.Location) {
        const location = relPlacement.Location
        if (location.Coordinates) {
          const coords = location.Coordinates
          matrix[12] = coords[0]?.value || 0
          matrix[13] = coords[1]?.value || 0
          matrix[14] = coords[2]?.value || 0
        }
      }
    }

    // Recursively get parent placement
    const placementRelToRef = placement.PlacementRelTo
    if (placementRelToRef && placementRelToRef.value) {
      const parentPlacement = webIfc.GetLine(modelID, placementRelToRef.value)
      if (parentPlacement) {
        const parentMatrix = getPlacementMatrix(parentPlacement, webIfc, modelID)
        // Multiply matrices (simplified - just add translations for now)
        matrix[12] += parentMatrix[12]
        matrix[13] += parentMatrix[13]
        matrix[14] += parentMatrix[14]
      }
    }
  } catch (err) {
    console.warn('[IFC→Doors] Error processing placement matrix:', err)
  }

  return matrix
}

/**
 * Find the world position of a door by searching for meshes containing its expressID
 */
function findDoorMeshPosition(expressID, originalIfcModel) {
  if (!expressID || !originalIfcModel) {
    return null
  }

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  let foundAny = false
  let totalMeshes = 0
  let meshesWithExpressIDs = 0

  // Search through all meshes in the Three.js Group tree
  // originalIfcModel is a Three.js Group, meshes are direct children
  originalIfcModel.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry) return

    totalMeshes++

    // Debug first mesh to see structure
    if (totalMeshes === 1) {
      console.log('[IFC→Doors] First mesh userData:', {
        hasUserData: !!mesh.userData,
        userDataKeys: mesh.userData ? Object.keys(mesh.userData) : [],
        expressID: mesh.userData?.expressID,
        expressIDs: mesh.userData?.expressIDs,
        hasExpressIDs: !!(mesh.userData?.expressIDs),
        isArray: Array.isArray(mesh.userData?.expressIDs)
      })
    }

    // Check if this mesh contains our expressID
    // Support both expressIDs (array) and expressID (single value)
    const meshExpressIDs = mesh.userData?.expressIDs
    const meshExpressID = mesh.userData?.expressID

    let matchesExpressID = false

    if (meshExpressIDs && Array.isArray(meshExpressIDs)) {
      meshesWithExpressIDs++
      matchesExpressID = meshExpressIDs.includes(expressID)
    } else if (meshExpressID !== undefined) {
      meshesWithExpressIDs++
      matchesExpressID = (meshExpressID === expressID)
    }

    if (!matchesExpressID) return

    // This mesh contains geometry for our door!
    foundAny = true

    const geometry = mesh.geometry
    const posAttr = geometry.attributes?.position
    if (!posAttr || !posAttr.array) return

    const vertices = posAttr.array
    const tempVec = new THREE.Vector3()

    // Ensure world matrix is up to date
    mesh.updateMatrixWorld(true)

    // Process all vertices in world space
    for (let i = 0; i < vertices.length; i += 3) {
      tempVec.set(vertices[i], vertices[i + 1], vertices[i + 2])
      tempVec.applyMatrix4(mesh.matrixWorld)

      minX = Math.min(minX, tempVec.x)
      maxX = Math.max(maxX, tempVec.x)
      minY = Math.min(minY, tempVec.y)
      maxY = Math.max(maxY, tempVec.y)
      minZ = Math.min(minZ, tempVec.z)
      maxZ = Math.max(maxZ, tempVec.z)
    }
  })

  console.log(`[IFC→Doors] Search for expressID ${expressID}: found ${totalMeshes} total meshes, ${meshesWithExpressIDs} with expressIDs, foundAny=${foundAny}`)

  if (foundAny && isFinite(minX)) {
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2
    }
  }

  return null
}

/**
 * OLD: Get door position from its geometry using ThatOpen FragmentsModel
 */
function getDoorPositionFromGeometry_OLD(doorNode, fragmentsModel) {
  const expressID = doorNode.userData.expressID
  if (!expressID || !fragmentsModel) {
    return null
  }

  try {
    // Get the geometry for this specific door using ThatOpen's fragment system
    // This is the same method used in buildHierarchy
    const geometry = fragmentsModel.getFragmentMap([expressID])

    if (!geometry || !geometry.length) {
      console.warn(`[IFC→Doors] No geometry fragments found for door ${expressID}`)
      return null
    }

    console.log(`[IFC→Doors] Found ${geometry.length} geometry fragments for door ${expressID}`)

    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    let hasVertices = false

    // Process each geometry fragment
    for (const geomData of geometry) {
      if (!geomData || !geomData.position) continue

      const posAttr = geomData.position
      if (posAttr.array && posAttr.array.length > 0) {
        hasVertices = true
        const vertices = posAttr.array

        // Get transform if available
        const transform = geomData.transform || new THREE.Matrix4()

        const tempVec = new THREE.Vector3()

        // Process vertices
        for (let i = 0; i < vertices.length; i += 3) {
          tempVec.set(vertices[i], vertices[i + 1], vertices[i + 2])
          tempVec.applyMatrix4(transform)

          minX = Math.min(minX, tempVec.x)
          maxX = Math.max(maxX, tempVec.x)
          minY = Math.min(minY, tempVec.y)
          maxY = Math.max(maxY, tempVec.y)
          minZ = Math.min(minZ, tempVec.z)
          maxZ = Math.max(maxZ, tempVec.z)
        }
      }
    }

    if (hasVertices && isFinite(minX)) {
      return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2
      }
    }

    return null
  } catch (err) {
    console.warn(`[IFC→Doors] Error getting geometry for door ${expressID}:`, err)
    return null
  }
}

/**
 * OLD: Get door position from ThatOpen fragment meshes (NOT WORKING - kept for reference)
 */
function getDoorPositionFromFragments_OLD(doorNode, originalIfcModel) {
  const expressID = doorNode.userData.expressID
  if (!expressID || !originalIfcModel) {
    console.warn('[IFC→Doors] Missing expressID or model for door position')
    return { x: 0, y: 0, z: 0 }
  }

  console.log(`[IFC→Doors] Analyzing door ${expressID}...`)

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  let foundMeshes = false
  let meshCount = 0
  let checkedMeshes = 0

  // Debug: log the structure of the model
  let totalMeshes = 0
  originalIfcModel.traverse(obj => {
    if (obj.isMesh) {
      totalMeshes++
      checkedMeshes++

      // Debug what data is available on meshes
      if (checkedMeshes === 1) {
        console.log('[IFC→Doors] First mesh structure:', {
          hasFragment: !!obj.fragment,
          hasUserData: !!obj.userData,
          userDataKeys: obj.userData ? Object.keys(obj.userData) : [],
          userDataValues: obj.userData ? {
            expressID: obj.userData.expressID,
            expressIDs: obj.userData.expressIDs,
            ifcType: obj.userData.ifcType,
            ifcModelID: obj.userData.ifcModelID
          } : {},
          fragmentKeys: obj.fragment ? Object.keys(obj.fragment) : [],
          hasGeometry: !!obj.geometry
        })
      }

      // Log ALL userData for first few meshes to see the structure
      if (checkedMeshes <= 3) {
        console.log(`[IFC→Doors] Mesh ${checkedMeshes} userData:`, obj.userData)
      }

      // Check multiple ways to find expressID association
      let belongsToDoor = false

      // Method 1: Check obj.fragment.ids (ThatOpen Fragments)
      if (obj.fragment && obj.fragment.ids) {
        if (obj.fragment.ids.includes(expressID)) {
          belongsToDoor = true
          console.log(`[IFC→Doors] Found via fragment.ids`)
        }
      }

      // Method 2: Check obj.userData.expressID
      if (obj.userData && obj.userData.expressID === expressID) {
        belongsToDoor = true
        console.log(`[IFC→Doors] Found via userData.expressID`)
      }

      // Method 3: Check obj.userData.expressIDs array
      if (obj.userData && obj.userData.expressIDs) {
        if (obj.userData.expressIDs.includes(expressID)) {
          belongsToDoor = true
          console.log(`[IFC→Doors] Found via userData.expressIDs`)
        }
      }

      if (belongsToDoor) {
        foundMeshes = true
        meshCount++

        // Get geometry
        const geometry = obj.geometry
        const posAttr = geometry.attributes?.position

        if (posAttr && posAttr.array) {
          const vertices = posAttr.array
          const tempVec = new THREE.Vector3()

          console.log(`[IFC→Doors] Processing mesh with ${vertices.length / 3} vertices`)

          // Update matrix
          obj.updateMatrixWorld(true)

          // Process vertices in world space
          for (let i = 0; i < vertices.length; i += 3) {
            tempVec.set(vertices[i], vertices[i + 1], vertices[i + 2])
            tempVec.applyMatrix4(obj.matrixWorld)

            minX = Math.min(minX, tempVec.x)
            maxX = Math.max(maxX, tempVec.x)
            minY = Math.min(minY, tempVec.y)
            maxY = Math.max(maxY, tempVec.y)
            minZ = Math.min(minZ, tempVec.z)
            maxZ = Math.max(maxZ, tempVec.z)
          }

          console.log(`[IFC→Doors] Bounds so far:`, {
            x: [minX, maxX],
            y: [minY, maxY],
            z: [minZ, maxZ]
          })
        }
      }
    }
  })

  console.log(`[IFC→Doors] Checked ${checkedMeshes} meshes, found ${meshCount} belonging to door ${expressID}`)

  if (foundMeshes && isFinite(minX)) {
    const result = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2
    }
    console.log(`[IFC→Doors] Final position for door ${expressID}:`, result)
    return result
  }

  console.warn(`[IFC→Doors] No valid geometry found for door ${expressID}`)
  return { x: 0, y: 0, z: 0 }
}

/**
 * Get door opening direction from metadata
 */
function getDoorDirection(doorNode) {
  if (doorNode.userData?.ifcProperties) {
    const props = doorNode.userData.ifcProperties
    const opType = (props.operationType || props.OperationType || '').toUpperCase()
    const predType = (props.predefinedType || '').toUpperCase()

    if (opType.includes('LEFT') || predType.includes('LEFT')) return -1
    if (opType.includes('RIGHT') || predType.includes('RIGHT')) return 1
  }

  return 1 // Default: open to the right
}

/**
 * Create door toggle handler
 */
function createDoorToggleHandler(doorNode) {
  return function() {
    const state = doorNode.userData.doorState
    if (!state) return

    // Get action node reference from state
    const actionNode = state.actionNode

    if (state.isOpen) {
      // Close door
      state.targetRotation = 0
      state.isOpen = false
      if (actionNode) actionNode.label = 'Open Door'
    } else {
      // Open door
      state.targetRotation = state.openAngle * state.direction
      state.isOpen = true
      if (actionNode) actionNode.label = 'Close Door'
    }

    // Animate door rotation
    animateDoor(doorNode, state)
  }
}

/**
 * Animate door rotation smoothly
 */
function animateDoor(doorNode, state) {
  const startRotation = doorNode.rotation.y
  const targetRotation = state.originalRotation + state.targetRotation
  const duration = 0.5 // seconds
  const startTime = Date.now()

  function animate() {
    const elapsed = (Date.now() - startTime) / 1000
    const progress = Math.min(elapsed / duration, 1)

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3)

    doorNode.rotation.y = startRotation + (targetRotation - startRotation) * eased

    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }

  animate()
}
