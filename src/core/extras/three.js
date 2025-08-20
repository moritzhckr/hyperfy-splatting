import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'

import * as THREE from 'three'

export * from 'three'

// override THREE.Vector3 with ours to support _onChange
export { Vector3Enhanced as Vector3 } from './Vector3Enhanced'

// install three-mesh-bvh
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

// utility to resize instanced mesh buffers
THREE.InstancedMesh.prototype.resize = function (size) {
  const prevSize = this.instanceMatrix.array.length / 16
  if (size <= prevSize) return
  const matrices = new Float32Array(size * 16)
  matrices.set(this.instanceMatrix.array)
  this.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16)
  this.instanceMatrix.needsUpdate = true
  if (this.instanceColor) {
    const colors = new Float32Array(size * 3) // RGB values
    colors.set(this.instanceColor.array)
    this.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
    this.instanceColor.needsUpdate = true
  }
}
