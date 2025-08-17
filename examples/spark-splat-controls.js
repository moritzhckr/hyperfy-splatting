/**
 * Spark.js Gaussian Splat Controls
 * Interactive sliders for Spark.js splat rendering
 */

app.configure([
  {
    key: 'splatScale',
    type: 'range',
    label: 'Splat Size',
    initial: 1.0,
    min: 0.1,
    max: 5.0,
    step: 0.1,
    hint: 'Controls the overall size of all splats'
  },
  {
    key: 'opacity',
    type: 'range', 
    label: 'Opacity',
    initial: 1.0,
    min: 0.0,
    max: 1.0,
    step: 0.01,
    hint: 'Controls transparency of all splats'
  },
  {
    key: 'splatFile',
    type: 'text',
    label: 'Splat File',
    initial: 'asset://example.ply',
    hint: 'Path to the splat file (.ply, .splat, .ksplat, .spz)'
  },
  {
    key: 'sortMode',
    type: 'select',
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
    key: 'sphericalHarmonics',
    type: 'toggle',
    label: 'Spherical Harmonics',
    initial: true,
    hint: 'Enable advanced lighting (if available in file)'
  },
  {
    key: 'reloadButton',
    type: 'toggle',
    label: 'Reload Splats',
    initial: false,
    hint: 'Toggle to reload the splat file'
  }
])

let splatNode = null

// Create the Spark.js gaussian splat node
function createSplatNode() {
  if (splatNode) {
    app.remove(splatNode)
  }
  
  splatNode = app.create('gaussiansplat', {
    src: props.splatFile,
    splatScale: props.splatScale,
    opacity: props.opacity,
    sphericalHarmonics: props.sphericalHarmonics,
    sortMode: props.sortMode
  })
  
  app.add(splatNode)
  console.log('🔥 Created Spark.js GaussianSplat with:', {
    src: splatNode.src,
    splatScale: splatNode.splatScale,
    opacity: splatNode.opacity,
    sortMode: splatNode.sortMode,
    sphericalHarmonics: splatNode.sphericalHarmonics
  })
}

// Update properties in real-time
let lastProps = {}
function updateSplatProperties() {
  if (!splatNode) return
  
  // Only update if properties actually changed to avoid spam
  const currentProps = {
    splatScale: props.splatScale,
    opacity: props.opacity,
    sortMode: props.sortMode,
    sphericalHarmonics: props.sphericalHarmonics
  }
  
  let hasChanges = false
  for (const [key, value] of Object.entries(currentProps)) {
    if (lastProps[key] !== value) {
      hasChanges = true
      splatNode[key] = value
    }
  }
  
  if (hasChanges) {
    console.log('🎛️ Updated Spark.js splat properties:', currentProps)
    lastProps = { ...currentProps }
  }
}

// Initialize
createSplatNode()

// Watch for property changes
let lastReloadState = props.reloadButton

app.on('update', () => {
  // Update properties in real-time
  updateSplatProperties()
  
  // Handle reload button
  if (props.reloadButton !== lastReloadState && props.reloadButton) {
    console.log('🔄 Reloading Spark.js splats...')
    createSplatNode()
    lastReloadState = props.reloadButton
  }
  
  // Show loading state
  if (splatNode && splatNode.loadingState === 'loading') {
    app.state.status = 'Loading splats...'
  }
  
  if (splatNode && splatNode.loadingState === 'loaded') {
    app.state.status = `Loaded: ${props.splatFile}`
  }
  
  if (splatNode && splatNode.loadingState === 'error') {
    app.state.status = 'Error loading splats'
  }
})

// Reference objects removed - clean view for splats only

// Expose functions for debugging
if (world.isClient) {
  globalThis.sparkSplatControls = {
    getSplatNode: () => splatNode,
    updateProps: updateSplatProperties,
    reload: createSplatNode,
    getStats: () => splatNode ? {
      loadingState: splatNode.loadingState,
      hasHandle: !!splatNode.handle,
      src: splatNode.src
    } : null,
    testFormats: () => {
      console.log('🔥 Spark.js supported formats:')
      console.log('  .PLY - Point cloud format (also compressed)')
      console.log('  .SPZ - Sparse Z format')
      console.log('  .SPLAT - Binary splat format')
      console.log('  .KSPLAT - Compressed splat format')
      console.log('')
      console.log('💡 Change the "Splat File" field to test different formats!')
    }
  }
}

console.log('🌟 Spark.js Gaussian Splat Controls loaded!')
console.log('🎛️ Use the sliders to adjust splat properties in real-time')
console.log('📁 Supports all Spark.js formats: .ply, .splat, .ksplat, .spz')
console.log('💻 Open console and run sparkSplatControls.testFormats() for more info')