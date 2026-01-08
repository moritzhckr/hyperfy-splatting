import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { hashFile } from '../src/core/utils-server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

async function createGsHyp() {
  // Read the GaussianSplat.js script
  const scriptPath = path.join(rootDir, 'apps', 'GaussianSplat.js')
  const scriptContent = await fs.readFile(scriptPath, 'utf-8')
  
  // Calculate hash of the script content
  const scriptBuffer = Buffer.from(scriptContent, 'utf-8')
  const scriptHash = await hashFile(scriptBuffer)
  const scriptFilename = `${scriptHash}.js`
  const scriptUrl = `asset://${scriptFilename}`
  
  // Read the icon file
  const iconPath = path.join(rootDir, 'src', 'world', 'collections', 'default', 'gs-icon.png')
  const iconBuffer = await fs.readFile(iconPath)
  const iconHash = await hashFile(iconBuffer)
  const iconFilename = `${iconHash}.png`
  const iconUrl = `asset://${iconFilename}`
  
  // Create the blueprint
  const blueprint = {
    id: null, // Will be set when imported
    version: 0,
    name: 'Gaussian Splat',
    image: {
      type: 'texture',
      name: 'gs-icon.png',
      url: iconUrl,
    },
    author: null,
    url: null,
    desc: 'A Gaussian Splat app for displaying 3D Gaussian Splatting files',
    model: 'script-only', // Dummy model for script-only apps to appear in list
    script: scriptUrl,
    props: {},
    preload: false,
    public: false,
    locked: false,
    unique: false,
    scene: false,
    disabled: false,
    frozen: false,
  }
  
  // Create assets array
  // Note: In Node.js, we need to use Buffer instead of File
  const scriptSize = scriptBuffer.length
  const iconSize = iconBuffer.length
  
  const assets = [
    {
      type: 'script',
      url: scriptUrl,
      size: scriptSize,
      mime: 'text/javascript',
      buffer: scriptBuffer,
    },
    {
      type: 'texture',
      url: iconUrl,
      size: iconSize,
      mime: 'image/png',
      buffer: iconBuffer,
    },
  ]
  
  // Create header
  const header = {
    blueprint,
    assets: assets.map(asset => ({
      type: asset.type,
      url: asset.url,
      size: asset.size,
      mime: asset.mime,
    })),
  }
  
  // Convert header to bytes
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  
  // Create header size prefix (4 bytes, little-endian)
  const headerSize = new Uint8Array(4)
  new DataView(headerSize.buffer).setUint32(0, headerBytes.length, true)
  
  // Get asset file data
  const assetBuffers = assets.map(asset => asset.buffer)
  
  // Combine: header size + header + asset files
  const fileBuffer = Buffer.concat([
    Buffer.from(headerSize),
    Buffer.from(headerBytes),
    ...assetBuffers,
  ])
  
  // Write the .hyp file
  const outputPath = path.join(rootDir, 'src', 'world', 'collections', 'default', 'gs.hyp')
  await fs.writeFile(outputPath, fileBuffer)
  
  console.log(`✅ Created ${outputPath}`)
  console.log(`   Blueprint: ${blueprint.name}`)
  console.log(`   Script: ${scriptUrl}`)
}

createGsHyp().catch(console.error)

