/**
 * Debug Test for Spark.js Gaussian Splatting
 * Testing basic functionality that works reliably
 */

// Only run on client
if (world.isClient) {

console.log('🔍 Starting Spark.js debug test...')

// Create a simple splat with minimal parameters
const debugSplat = app.create('gaussiansplat', {
  src: 'asset://example.ply',
  position: [0, 1, 0]
})

app.add(debugSplat)

// Test other working parameters

app.on('chat', (message) => {
  const parts = message.text.split(' ')
  const command = parts[0]
  const value = parseFloat(parts[1])
  
  switch (command) {
      
    case '/info':
      console.log('🔍 Current splat properties:')
      console.log('  Src:', debugSplat.src)
      console.log('  Loading state:', debugSplat.loadingState)
      console.log('  Handle exists:', !!debugSplat.handle)
      if (debugSplat.handle) {
        console.log('  SplatMesh exists:', !!debugSplat.handle.splatMesh)
        if (debugSplat.handle.splatMesh) {
          console.log('  SplatMesh scale:', debugSplat.handle.splatMesh.scale)
          console.log('  SplatMesh visible:', debugSplat.handle.splatMesh.visible)
        }
      }
      break
      
    case '/reload':
      console.log('🔄 Reloading splat...')
      // Force reload by changing src temporarily
      const originalSrc = debugSplat.src
      debugSplat.src = null
      setTimeout(() => {
        debugSplat.src = originalSrc
      }, 100)
      break
      
    case '/debug-help':
      console.log('🔍 Debug Commands:')
      console.log('/info - Show all splat properties')
      console.log('/reload - Force reload splat')
      break
  }
})

// Monitor loading state changes
let lastState = ''
app.on('update', () => {
  if (debugSplat.loadingState !== lastState) {
    lastState = debugSplat.loadingState
    console.log(`🔄 Loading state changed to: ${lastState}`)
    
    if (lastState === 'loaded') {
      console.log('✅ Splat loaded! Try /info to see properties')
    } else if (lastState === 'error') {
      console.log('❌ Splat failed to load')
    }
  }
})

console.log('🔍 Debug test ready!')
console.log('💡 Type /debug-help for commands')
console.log('🎯 Focus: Testing basic Gaussian Splat loading')

}