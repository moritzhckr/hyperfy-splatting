/**
 * Spark.js Gaussian Splat Test
 * Clean integration of Spark.js with Hyperfy - supports all formats
 */

// Test with PLY file
const testSplat = app.create('gaussiansplat', {
  src: 'asset://example.ply',  // Spark.js supports .ply natively
  position: [0, 1, 0],
  splatScale: 1.0,
  opacity: 1.0,
  sphericalHarmonics: true,
  sortMode: 'auto'
})

app.add(testSplat)

// Clean view - no reference objects needed

// Test multiple formats if available
const formatTests = [
  { file: 'example.ply', pos: [0, 1, 0], name: 'PLY Format' },
  // Uncomment these when you have the files:
  // { file: 'example.splat', pos: [3, 1, 0], name: 'SPLAT Format' },
  // { file: 'example.ksplat', pos: [-3, 1, 0], name: 'KSPLAT Format' },
  // { file: 'example.spz', pos: [0, 1, 3], name: 'SPZ Format' }
]

formatTests.forEach((test, index) => {
  if (index === 0) return // Skip first one, already created above
  
  const splat = app.create('gaussiansplat', {
    src: `asset://${test.file}`,
    position: test.pos,
    splatScale: 1.0,
    opacity: 1.0
  })
  app.add(splat)
})

// Interactive controls
app.on('chat', (message) => {
  const parts = message.text.split(' ')
  const command = parts[0]
  
  switch (command) {
    case '/scale':
      const scale = parseFloat(parts[1]) || 1.0
      testSplat.splatScale = Math.max(0.1, Math.min(5.0, scale))
      console.log(`🎛️ Splat scale set to: ${testSplat.splatScale}`)
      break
      
    case '/opacity':
      const opacity = parseFloat(parts[1]) || 1.0
      testSplat.opacity = Math.max(0.0, Math.min(1.0, opacity))
      console.log(`🎛️ Splat opacity set to: ${testSplat.opacity}`)
      break
      
    case '/formats':
      console.log('🔥 Spark.js supported formats:')
      console.log('  .PLY (also compressed)')
      console.log('  .SPZ')
      console.log('  .SPLAT')
      console.log('  .KSPLAT')
      break
      
    case '/help':
      console.log('Available commands:')
      console.log('/scale [0.1-5.0] - Adjust splat scale')
      console.log('/opacity [0.0-1.0] - Adjust transparency')
      console.log('/formats - Show supported formats')
      break
  }
})

// Monitor loading state
let lastState = ''
app.on('update', () => {
  if (testSplat.loadingState !== lastState) {
    lastState = testSplat.loadingState
    console.log('🔄 Splat loading state:', lastState)
    
    if (lastState === 'loaded') {
      console.log('✅ Gaussian splat loaded with Spark.js!')
    } else if (lastState === 'error') {
      console.log('❌ Failed to load splat. Check the file format and path.')
    }
  }
})

console.log('🌟 Spark.js Gaussian Splat test loaded!')
console.log('💡 Type /help in chat for commands')
console.log('📁 Testing with PLY file format')
console.log('🔥 Using native Spark.js rendering - all formats supported!')