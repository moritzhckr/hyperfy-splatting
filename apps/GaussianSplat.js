/**
 * Gaussian Splat App v2
 * Simple and functional splat app with cube handle toggle
 * Based on model app pattern for reliable prop handling
 */

// Only run on client - server doesn't have Spark.js or DOM APIs
if (world.isClient) {

app.configure([
  {
    key: 'splatFile',
    type: 'file',
    label: 'Splat File',
    initial: null,
    accept: '.ply,.splat,.ksplat,.spz',
    hint: 'Upload PLY, KSPLAT, SPLAT, or SPZ file'
  },
  {
    key: 'sortMode',
    type: 'switch',
    label: 'Sort Mode',
    initial: 'auto',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'distance', label: 'Distance' },
      { value: 'none', label: 'None' }
    ],
    hint: 'Splat sorting algorithm'
  },
  {
    key: 'showCube',
    type: 'toggle',
    label: 'Show Cube Handle',
    initial: true,
    hint: 'Toggle visibility of positioning cube handle'
  },
  {
    key: 'autoRotate',
    type: 'toggle',
    label: 'Auto-Rotate Splats',
    initial: true,
    hint: 'Automatically rotate splats 180° on X-axis for correct orientation'
  }
])

// Create cube handle immediately
const cubeHandle = app.create('prim', {
  type: 'box',
  position: [0, 0, 0],
  scale: [1, 1, 1],
  color: '#ffaa00',
  opacity: 0.3,
  transparent: true,
  castShadow: false,
  receiveShadow: false
})
app.add(cubeHandle)

// State for splat
let splat = null
let lastSplatFile = null
let lastSortMode = null
let lastShowCube = null

app.on('update', () => {
  // Update cube visibility only when changed
  if (cubeHandle && typeof props.showCube !== 'undefined' && props.showCube !== lastShowCube) {
    cubeHandle.visible = props.showCube
    lastShowCube = props.showCube
  }
  
  // Handle splat file changes
  if (props.splatFile && typeof props.splatFile === 'string' && props.splatFile.startsWith('asset://')) {
    // Only create new splat if the file changed
    if (props.splatFile !== lastSplatFile) {
      // Remove old splat if exists
      if (splat && splat.parent) {
        splat.parent.remove(splat)
        splat = null
      }
      
      // Create new splat (only once!)
      try {
        splat = app.create('gaussiansplat', {
          src: props.splatFile,
          sortMode: props.sortMode || 'auto',
          linked: false
        })
        
        // Rotate 180° around X-axis to fix splat orientation (if enabled)
        if (props.autoRotate !== false) {
          splat.rotation.x = Math.PI
        }
        
        app.add(splat)
        lastSplatFile = props.splatFile
      } catch (error) {
        console.error('❌ Failed to create splat:', error)
      }
    }
    
    // Update sort mode if it changed
    if (splat && props.sortMode && props.sortMode !== lastSortMode) {
      try {
        splat.sortMode = props.sortMode
        lastSortMode = props.sortMode
      } catch (error) {
        console.error('❌ Failed to update sort mode:', error)
      }
    }
  }
})

console.log('🌟 Gaussian Splat app ready!')
console.log('💡 Use the controls to upload a splat file or toggle cube visibility')

} // end if (world.isClient)