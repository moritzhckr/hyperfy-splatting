import * as THREE from './three'

/**
 * Streaming Gaussian Splat Loader
 *
 * Progressively loads and renders splats as data arrives,
 * instead of waiting for the complete file to download.
 *
 * Supports: PLY format (uncompressed)
 * Note: SPZ (gzip compressed) requires full download before decompression
 */

// PLY header parser
function parsePlyHeader(headerText) {
  const lines = headerText.split('\n')
  let vertexCount = 0
  const properties = []
  let inVertexElement = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('element vertex')) {
      vertexCount = parseInt(trimmed.split(' ')[2], 10)
      inVertexElement = true
    } else if (trimmed.startsWith('element') && inVertexElement) {
      inVertexElement = false
    } else if (trimmed.startsWith('property') && inVertexElement) {
      const parts = trimmed.split(' ')
      const type = parts[1]
      const name = parts[2]
      properties.push({ type, name })
    } else if (trimmed === 'end_header') {
      break
    }
  }

  return { vertexCount, properties }
}

// Get byte size for PLY property type
function getPropertySize(type) {
  switch (type) {
    case 'float': case 'float32': return 4
    case 'double': case 'float64': return 8
    case 'int': case 'int32': return 4
    case 'uint': case 'uint32': return 4
    case 'short': case 'int16': return 2
    case 'ushort': case 'uint16': return 2
    case 'char': case 'int8': return 1
    case 'uchar': case 'uint8': return 1
    default: return 4
  }
}

// Calculate bytes per vertex from properties
function getBytesPerVertex(properties) {
  return properties.reduce((sum, prop) => sum + getPropertySize(prop.type), 0)
}

// Parse a single splat from binary data
function parseSplat(dataView, offset, properties) {
  const values = {}
  let currentOffset = offset

  for (const prop of properties) {
    const size = getPropertySize(prop.type)

    switch (prop.type) {
      case 'float': case 'float32':
        values[prop.name] = dataView.getFloat32(currentOffset, true)
        break
      case 'double': case 'float64':
        values[prop.name] = dataView.getFloat64(currentOffset, true)
        break
      case 'int': case 'int32':
        values[prop.name] = dataView.getInt32(currentOffset, true)
        break
      case 'uint': case 'uint32':
        values[prop.name] = dataView.getUint32(currentOffset, true)
        break
      case 'uchar': case 'uint8':
        values[prop.name] = dataView.getUint8(currentOffset)
        break
      default:
        values[prop.name] = dataView.getFloat32(currentOffset, true)
    }

    currentOffset += size
  }

  return values
}

// Convert parsed values to Spark format
function valuesToSplat(values) {
  const center = new THREE.Vector3(
    values.x || 0,
    values.y || 0,
    values.z || 0
  )

  // Scale values (log-encoded in PLY)
  const scales = new THREE.Vector3(
    Math.exp(values.scale_0 || values.f_scale_0 || 0),
    Math.exp(values.scale_1 || values.f_scale_1 || 0),
    Math.exp(values.scale_2 || values.f_scale_2 || 0)
  )

  // Quaternion (may be stored as rot_0/1/2/3 or f_rot_0/1/2/3)
  const quaternion = new THREE.Quaternion(
    values.rot_1 || values.f_rot_1 || 0,
    values.rot_2 || values.f_rot_2 || 0,
    values.rot_3 || values.f_rot_3 || 0,
    values.rot_0 || values.f_rot_0 || 1
  ).normalize()

  // Opacity (sigmoid of raw value)
  const rawOpacity = values.opacity || values.f_opacity || 0
  const opacity = 1 / (1 + Math.exp(-rawOpacity))

  // Color (SH DC coefficients, convert from SH to RGB)
  const SH_C0 = 0.28209479177387814
  const color = new THREE.Color(
    Math.max(0, Math.min(1, 0.5 + SH_C0 * (values.f_dc_0 || 0))),
    Math.max(0, Math.min(1, 0.5 + SH_C0 * (values.f_dc_1 || 0))),
    Math.max(0, Math.min(1, 0.5 + SH_C0 * (values.f_dc_2 || 0)))
  )

  return { center, scales, quaternion, opacity, color }
}

/**
 * Stream-load a PLY file and progressively add splats to the mesh
 *
 * @param {Object} options
 * @param {string} options.url - URL to fetch the PLY file from
 * @param {File} options.file - File object (alternative to URL)
 * @param {ArrayBuffer} options.fileBytes - Pre-loaded file bytes (preferred)
 * @param {SplatMesh} options.splatMesh - Spark SplatMesh instance
 * @param {number} options.batchSize - Splats to add before updating (default: 10000)
 * @param {function} options.onProgress - Progress callback (loaded, total)
 * @param {function} options.onBatch - Called after each batch is added
 */
export async function streamLoadPly(options) {
  // Smaller batches = more frequent visual updates, but slower overall
  // Larger batches = faster loading, but less responsive visual updates
  const isMobile = typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  const defaultBatchSize = isMobile ? 5000 : 10000  // Smaller batches on mobile

  const { url, file, fileBytes, splatMesh, batchSize = defaultBatchSize, onProgress, onBatch } = options

  console.log('🌊 [StreamingSplatLoader] Starting streaming load...')

  // Get the data source
  let response
  if (url) {
    response = await fetch(url)
  } else if (fileBytes) {
    // Use pre-loaded bytes (can be reused multiple times)
    const blob = new Blob([fileBytes])
    response = new Response(blob.stream())
  } else if (file) {
    // Create a readable stream from the file (can only be read once!)
    const arrayBuffer = await file.arrayBuffer()
    const blob = new Blob([arrayBuffer])
    response = new Response(blob.stream())
  } else {
    throw new Error('Either url, file, or fileBytes must be provided')
  }

  const contentLength = response.headers.get('Content-Length')
  const totalBytes = contentLength ? parseInt(contentLength, 10) : (fileBytes?.byteLength || file?.size || 0)

  const reader = response.body.getReader()
  const chunks = []
  let receivedBytes = 0
  let headerParsed = false
  let header = null
  let headerEndIndex = 0
  let bytesPerVertex = 0
  let splatsLoaded = 0
  let pendingData = new Uint8Array(0)

  console.log('🌊 [StreamingSplatLoader] Total bytes:', totalBytes)

  while (true) {
    const { done, value } = await reader.read()

    if (done) break

    receivedBytes += value.length

    // Append new data to pending buffer
    const newPending = new Uint8Array(pendingData.length + value.length)
    newPending.set(pendingData)
    newPending.set(value, pendingData.length)
    pendingData = newPending

    // Parse header if not yet done
    if (!headerParsed) {
      const textDecoder = new TextDecoder()
      const text = textDecoder.decode(pendingData)
      const endHeaderIndex = text.indexOf('end_header\n')

      if (endHeaderIndex !== -1) {
        headerEndIndex = endHeaderIndex + 'end_header\n'.length
        const headerText = text.substring(0, headerEndIndex)
        header = parsePlyHeader(headerText)
        bytesPerVertex = getBytesPerVertex(header.properties)
        headerParsed = true

        console.log('🌊 [StreamingSplatLoader] Header parsed:')
        console.log('   Vertex count:', header.vertexCount)
        console.log('   Bytes per vertex:', bytesPerVertex)
        console.log('   Properties:', header.properties.length)
        console.log('   Property names:', header.properties.map(p => p.name).join(', '))

        // Reset numSplats to 0 before loading new data
        splatMesh.numSplats = 0
        splatMesh.packedSplats.numSplats = 0
        splatsLoaded = 0

        // Ensure mesh has capacity
        splatMesh.packedSplats.ensureSplats(header.vertexCount)

        // Remove header from pending data
        pendingData = pendingData.slice(headerEndIndex)
      }
    }

    // Process vertex data if header is parsed
    if (headerParsed && pendingData.length >= bytesPerVertex) {
      const dataView = new DataView(pendingData.buffer, pendingData.byteOffset, pendingData.length)
      let offset = 0
      let batchCount = 0

      while (offset + bytesPerVertex <= pendingData.length && splatsLoaded < header.vertexCount) {
        const values = parseSplat(dataView, offset, header.properties)
        const { center, scales, quaternion, opacity, color } = valuesToSplat(values)

        // Debug first few splats
        if (splatsLoaded < 3) {
          console.log(`🌊 [StreamingSplatLoader] Splat ${splatsLoaded}:`, {
            center: { x: center.x.toFixed(3), y: center.y.toFixed(3), z: center.z.toFixed(3) },
            scales: { x: scales.x.toFixed(3), y: scales.y.toFixed(3), z: scales.z.toFixed(3) },
            opacity: opacity.toFixed(3),
            color: { r: color.r.toFixed(3), g: color.g.toFixed(3), b: color.b.toFixed(3) }
          })
        }

        // Add splat to mesh
        splatMesh.packedSplats.pushSplat(center, scales, quaternion, opacity, color)

        offset += bytesPerVertex
        splatsLoaded++
        batchCount++

        // Update after batch
        if (batchCount >= batchSize) {
          splatMesh.packedSplats.needsUpdate = true
          splatMesh.numSplats = splatsLoaded

          // Force GPU update
          if (splatMesh.updateGenerator) {
            splatMesh.updateGenerator()
          }

          if (onBatch) {
            onBatch(splatsLoaded, header.vertexCount)
          }

          console.log(`🌊 [StreamingSplatLoader] Batch loaded: ${splatsLoaded}/${header.vertexCount}`)
          batchCount = 0

          // Yield to allow rendering - use requestAnimationFrame for better timing
          await new Promise(resolve => {
            if (typeof requestAnimationFrame !== 'undefined') {
              requestAnimationFrame(() => setTimeout(resolve, 0))
            } else {
              setTimeout(resolve, 16) // ~60fps
            }
          })
        }
      }

      // Keep unprocessed data
      pendingData = pendingData.slice(offset)
    }

    if (onProgress) {
      onProgress(receivedBytes, totalBytes)
    }
  }

  // Final update
  splatMesh.packedSplats.needsUpdate = true
  splatMesh.numSplats = splatsLoaded

  console.log(`✅ [StreamingSplatLoader] Complete: ${splatsLoaded} splats loaded`)

  return {
    splatsLoaded,
    totalSplats: header?.vertexCount || splatsLoaded
  }
}

/**
 * Create a SplatMesh with streaming support
 *
 * @param {Object} options
 * @param {string} options.url - URL to fetch
 * @param {File} options.file - File object
 * @param {ArrayBuffer} options.fileBytes - Pre-loaded file bytes (preferred)
 * @param {number} options.maxSplats - Estimated max splats (for pre-allocation)
 * @param {function} options.onProgress - Progress callback
 * @param {function} options.onBatch - Called after each batch
 * @param {function} options.onMeshReady - Called when mesh is ready to be added to scene (before loading completes)
 */
export async function createStreamingSplatMesh(options) {
  const { SplatMesh, PackedSplats } = await import('@sparkjsdev/spark')
  const { url, file, fileBytes, maxSplats = 1000000, onProgress, onBatch, onMeshReady } = options

  console.log('🌊 [StreamingSplatLoader] Creating streaming SplatMesh...')

  // Create a FRESH PackedSplats for this mesh
  const packedSplats = new PackedSplats({ maxSplats: maxSplats })
  await packedSplats.initialized

  // Reset to ensure clean state
  packedSplats.numSplats = 0

  // Create mesh with the fresh PackedSplats
  const splatMesh = new SplatMesh({
    packedSplats: packedSplats
  })

  // Wait for mesh initialization
  await splatMesh.initialized

  // Ensure numSplats is 0 before streaming
  splatMesh.numSplats = 0

  console.log('🌊 [StreamingSplatLoader] Fresh mesh created, numSplats:', splatMesh.numSplats)

  // IMPORTANT: Notify that mesh is ready to be added to scene BEFORE loading
  // This allows progressive rendering while data streams in
  if (onMeshReady) {
    onMeshReady(splatMesh)
  }

  // Start streaming load (mesh is already in scene, will update progressively)
  await streamLoadPly({
    url,
    file,
    fileBytes,
    splatMesh,
    onProgress,
    onBatch
  })

  return splatMesh
}

export default {
  streamLoadPly,
  createStreamingSplatMesh
}
