import { css } from '@firebolt-dev/css'
import {
  BlendIcon,
  BoxIcon,
  CircleIcon,
  DumbbellIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  LayersIcon,
  MagnetIcon,
  PersonStandingIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cls } from './cls'

export function NodeHierarchy({ app }) {
  const [selectedNode, setSelectedNode] = useState(null)
  const [visibilityState, setVisibilityState] = useState(new Map())
  const rootNode = useMemo(() => {
    // Try to get the actual rendered root node first (app.root)
    // This is the node that's actually in the scene and can be toggled
    if (app.root && app.root.mounted) {
      return app.root
    }
    // Fallback to getNodes() for display purposes
    const nodes = app.getNodes()
    console.log('[NodeHierarchy] Using getNodes() fallback:', nodes)
    return nodes
  }, [app])

  useEffect(() => {
    if (rootNode && !selectedNode) {
      setSelectedNode(rootNode)
    }
  }, [rootNode])

  // Helper function to safely get vector string
  const getVectorString = vec => {
    if (!vec || typeof vec.x !== 'number') return null
    return `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`
  }

  // Helper function to safely check if a property exists
  const hasProperty = (obj, prop) => {
    try {
      return obj && typeof obj[prop] !== 'undefined'
    } catch (err) {
      return false
    }
  }

  // Toggle visibility of a node
  const toggleVisibility = (node, event) => {
    event.stopPropagation()
    const newState = new Map(visibilityState)
    const isVisible = newState.get(node.id) ?? true
    const newVisible = !isVisible
    newState.set(node.id, newVisible)
    setVisibilityState(newState)

    // Helper to set visibility on a node - tries multiple approaches
    const setNodeVisibility = (n, visible) => {
      if (!n) return
      
      // Method 1: Hyperfy node with active property (preferred)
      if (n.ctx && n.ctx.world && typeof n.active !== 'undefined') {
        // Force set the internal _active value and call activate/deactivate manually
        n._active = visible
        if (!visible && n.mounted) {
          n.deactivate()
        } else if (visible && n.mounted) {
          n.activate(n.ctx)
        } else if (visible && n.parent?.mounted) {
          n.activate(n.parent.ctx)
        } else if (visible && !n.parent && n.ctx) {
          n.activate(n.ctx)
        }
      }
      // Method 2: Direct Three.js object visible property
      else if (typeof n.visible !== 'undefined') {
        n.visible = visible
      }
      // Method 3: Access underlying Three.js object
      else if (n.obj && typeof n.obj.visible !== 'undefined') {
        n.obj.visible = visible
      }
      // Method 4: Try to find Three.js object in children or other properties
      else if (n.mesh && typeof n.mesh.visible !== 'undefined') {
        n.mesh.visible = visible
      }
    }

    // Set visibility on the node itself
    setNodeVisibility(node, newVisible)

    // Also traverse children to set visibility recursively
    if (node.traverse && typeof node.traverse === 'function') {
      node.traverse(child => {
        setNodeVisibility(child, newVisible)
      })
    } else if (node.children && Array.isArray(node.children)) {
      // Fallback: manually traverse children array
      const traverse = (children) => {
        for (let i = 0; i < children.length; i++) {
          setNodeVisibility(children[i], newVisible)
          if (children[i].children && Array.isArray(children[i].children)) {
            traverse(children[i].children)
          }
        }
      }
      traverse(node.children)
    }

    console.log('[NodeHierarchy] Toggled visibility for', node.id, 'to', newVisible, {
      hasCtx: !!node.ctx,
      hasWorld: !!node.ctx?.world,
      hasActive: typeof node.active !== 'undefined',
      mounted: node.mounted,
      hasVisible: typeof node.visible !== 'undefined',
      hasObj: !!node.obj,
    })
  }

  return (
    <div
      className='nodehierarchy noscrollbar'
      css={css`
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding-top: 0.5rem;
        .nodehierarchy-tree {
          flex: 1;
          padding: 0 1rem;
          overflow-y: auto;
          margin-bottom: 1.25rem;
        }
        .nodehierarchy-item {
          display: flex;
          align-items: center;
          padding: 0.25rem 0.375rem;
          border-radius: 0.325rem;
          font-size: 0.9375rem;
          cursor: pointer;
          &:hover {
            color: #00a7ff;
          }
          &.selected {
            color: #00a7ff;
            background: rgba(0, 167, 255, 0.1);
          }
          svg {
            margin-right: 0.5rem;
            opacity: 0.5;
            flex-shrink: 0;
          }
          span {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
          }
          &-indent {
            margin-left: 1.25rem;
          }
          &-visibility {
            margin-left: 0.5rem;
            padding: 0.125rem;
            border-radius: 0.25rem;
            &:hover {
              background: rgba(255, 255, 255, 0.1);
            }
          }
        }
        .nodehierarchy-empty {
          color: rgba(255, 255, 255, 0.5);
          text-align: center;
          padding: 1rem;
        }
        .nodehierarchy-details {
          flex-shrink: 0;
          border-top: 0.0625rem solid rgba(255, 255, 255, 0.05);
          padding: 1rem;
          max-height: 40vh;
          overflow-y: auto;
        }
        .nodehierarchy-detail {
          display: flex;
          margin-bottom: 0.5rem;
          font-size: 0.9375rem;
          &-label {
            width: 6.25rem;
            color: rgba(255, 255, 255, 0.5);
            flex-shrink: 0;
          }
          &-value {
            flex: 1;
            word-break: break-word;
            &.copy {
              cursor: pointer;
            }
          }
        }
      `}
    >
      <div className='nodehierarchy-tree'>
        {rootNode ? (
          renderHierarchy([rootNode], 0, selectedNode, setSelectedNode, visibilityState, toggleVisibility)
        ) : (
          <div className='nodehierarchy-empty'>
            <LayersIcon size={24} />
            <div>No nodes found</div>
          </div>
        )}
      </div>

      {selectedNode && (
        <div className='nodehierarchy-details'>
          <HierarchyDetail label='ID' value={selectedNode.id} copy />
          <HierarchyDetail label='Name' value={selectedNode.name} />

          {/* IFC Metadata */}
          {selectedNode.userData?.ifcElement && (
            <>
              {selectedNode.userData.expressID && (
                <HierarchyDetail label='IFC ExpressID' value={String(selectedNode.userData.expressID)} copy />
              )}
              {selectedNode.userData.ifcType && (
                <HierarchyDetail label='IFC Type' value={selectedNode.userData.ifcType} />
              )}
            </>
          )}

          {/* Position */}
          {hasProperty(selectedNode, 'position') && getVectorString(selectedNode.position) && (
            <HierarchyDetail label='Position' value={getVectorString(selectedNode.position)} />
          )}

          {/* Rotation */}
          {hasProperty(selectedNode, 'rotation') && getVectorString(selectedNode.rotation) && (
            <HierarchyDetail label='Rotation' value={getVectorString(selectedNode.rotation)} />
          )}

          {/* Scale */}
          {hasProperty(selectedNode, 'scale') && getVectorString(selectedNode.scale) && (
            <HierarchyDetail label='Scale' value={getVectorString(selectedNode.scale)} />
          )}

          {/* Material */}
          {hasProperty(selectedNode, 'material') && selectedNode.material && (
            <>
              <HierarchyDetail label='Material' value={selectedNode.material.type || 'Standard'} />
              {hasProperty(selectedNode.material, 'color') && selectedNode.material.color && (
                <HierarchyDetail
                  label='Color'
                  value={
                    selectedNode.material.color.getHexString
                      ? `#${selectedNode.material.color.getHexString()}`
                      : 'Unknown'
                  }
                />
              )}
            </>
          )}

          {/* Geometry */}
          {hasProperty(selectedNode, 'geometry') && selectedNode.geometry && (
            <HierarchyDetail label='Geometry' value={selectedNode.geometry.type || 'Custom'} />
          )}
        </div>
      )}
    </div>
  )
}

function HierarchyDetail({ label, value, copy }) {
  let handleCopy = copy ? () => navigator.clipboard.writeText(value) : null
  return (
    <div className='nodehierarchy-detail'>
      <div className='nodehierarchy-detail-label'>{label}</div>
      <div className={cls('nodehierarchy-detail-value', { copy })} onClick={handleCopy}>
        {value}
      </div>
    </div>
  )
}

const nodeIcons = {
  default: CircleIcon,
  group: FolderIcon,
  mesh: BoxIcon,
  rigidbody: DumbbellIcon,
  collider: BlendIcon,
  lod: EyeIcon,
  avatar: PersonStandingIcon,
  snap: MagnetIcon,
}

function renderHierarchy(nodes, depth = 0, selectedNode, setSelectedNode, visibilityState, toggleVisibility) {
  if (!Array.isArray(nodes)) return null

  return nodes.map(node => {
    if (!node) return null

    // Safely get children
    const children = node.children || []
    const hasChildren = Array.isArray(children) && children.length > 0
    const isSelected = selectedNode?.id === node.id
    const isVisible = visibilityState.get(node.id) ?? true
    const Icon = nodeIcons[node.name] || nodeIcons.default

    return (
      <div key={node.id}>
        <div
          className={cls('nodehierarchy-item', {
            'nodehierarchy-item-indent': depth > 0,
            selected: isSelected,
          })}
          style={{ marginLeft: depth * 20 }}
          onClick={() => setSelectedNode(node)}
        >
          <Icon size={14} />
          <span>{node.id === '$root' ? 'app' : node.id}</span>
          <div className='nodehierarchy-item-visibility' onClick={e => toggleVisibility(node, e)}>
            {isVisible ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
          </div>
        </div>
        {hasChildren && renderHierarchy(children, depth + 1, selectedNode, setSelectedNode, visibilityState, toggleVisibility)}
      </div>
    )
  })
}
