IDEA:
asking about integrating web-ifc-three, which is a library for loading IFC (Industry Foundation Classes) files - a standard format for BIM (Building Information Modeling) data - into THREE.js scenes. ClientLoader.js:1-4

Current Asset Loading Architecture
Hyperfy uses a dual-loader system with ClientLoader and ServerLoader that currently supports these asset types: model (GLB/GLTF), avatar (VRM), script, texture, image, video, HDR, audio, and emote. ClientLoader.js:113-241 ServerLoader.js:89-187

Integration Feasibility
Library Compatibility
Yes, it would work - web-ifc-three is built on THREE.js, and Hyperfy already uses THREE.js v0.173.0 as its core 3D library. package.json:70 ClientLoader.js:1

Integration Approach
You would add a new asset type (e.g., 'ifc') to the loader system, similar to how GLB models are handled: ClientLoader.js:169-186

The integration would involve:

Add IFC to file kinds - Define the IFC file type in the fileKinds configuration: Fields.js:414-419

Install web-ifc-three - Add it to package.json dependencies alongside the existing THREE.js loaders package.json:70-72

Implement IFC loading - Add an if (type === 'ifc') branch in ClientLoader.load() that:

Fetches the IFC file as an ArrayBuffer
Uses web-ifc-three's IFCLoader to parse it
Converts the result to Hyperfy's node structure via glbToNodes() or a similar adapter
Caches the result ClientLoader.js:169-186
Server-side handling - Add corresponding logic to ServerLoader (though IFC parsing might be skipped server-side like VRM avatars are): ServerLoader.js:146-166

Register in Apps system - Add IFC to the fileRemaps for blueprint configuration: Apps.js:384-417

Potential Challenges
File size - IFC files can be large; you'd need to ensure the upload system handles them: Inputs.js:420-421
Complexity - IFC models contain rich metadata beyond geometry; you'd need to decide how to expose this in Hyperfy's app system
Performance - IFC parsing can be computationally intensive; consider async loading with progress indicators: ClientLoader.js:62-77
Notes
The existing loader architecture is well-designed for extensibility - adding new asset types follows a clear pattern established by the existing model/avatar/texture loaders. The main work would be adapting web-ifc-three's output to Hyperfy's node structure and ensuring the file upload/caching mechanisms work with IFC files. Server-side IFC loading might be optional since the server loader already skips complex processing for some asset types like VRM avatars.


---

## IFC-Integration Implementierungs-Roadmap

### ✅ MACHBARKEIT: VOLLSTÄNDIG UMSETZBAR

Die Integration von IFC-Files ist technisch machbar, da:
- Hyperfy THREE.js v0.173.0 nutzt (kompatibel mit web-ifc-three)
- Die Loader-Architektur erweiterbar ist (bewährtes Muster mit GLB/VRM)
- Ähnliche Asset-Typen bereits erfolgreich implementiert sind

**Kritische Punkte:** Dateigröße, Performance, Metadaten-Handling, Server-Side Processing

---

### Phase 1: Abhängigkeiten & Grundlagen (Zeit: 2-3h)

#### 1.1 Installation web-ifc-three
- [ ] `web-ifc-three` zu package.json dependencies hinzufügen
- [ ] `npm install web-ifc-three` ausführen
- [ ] Version-Kompatibilität mit THREE.js v0.173.0 verifizieren
```json
"web-ifc-three": "^0.0.124"
```

#### 1.2 IFC-Worker vorbereiten (für Performance)
- [ ] web-ifc.wasm Datei in public/static Ordner kopieren
- [ ] Worker-Pfad für IFC-Parsing konfigurieren

---

### Phase 2: Asset-Type Definition (Zeit: 1-2h)

#### 2.1 File Kinds Definition in Fields.js
**Datei:** `src/client/components/Fields.js:402-451`

- [ ] IFC-Typ zum `fileKinds` Objekt hinzufügen:
```javascript
ifc: {
  type: 'ifc',
  accept: '.ifc',
  exts: ['ifc'],
  placeholder: 'ifc',
}
```

#### 2.2 File Remaps in Apps.js
**Datei:** `src/core/systems/Apps.js:387-420`

- [ ] IFC-Remap für Blueprint-Konfiguration hinzufügen:
```javascript
ifc: field => {
  field.type = 'file'
  field.kind = 'ifc'
}
```

---

### Phase 3: Client-Loader Implementation (Zeit: 4-6h)

#### 3.1 IFC-Loader Import in ClientLoader.js
**Datei:** `src/core/systems/ClientLoader.js:1-14`

- [ ] IFCLoader importieren:
```javascript
import { IFCLoader } from 'web-ifc-three/IFCLoader'
```

#### 3.2 IFCLoader Instanz erstellen
**Datei:** `src/core/systems/ClientLoader.js:26-36`

- [ ] Im Constructor IFCLoader initialisieren:
```javascript
this.ifcLoader = new IFCLoader()
// Optional: Worker-Pfad setzen für bessere Performance
this.ifcLoader.ifcManager.setWasmPath('static/')
```

#### 3.3 IFC zu Hyperfy-Nodes Converter erstellen
**Neue Datei:** `src/core/extras/ifcToNodes.js`

- [ ] Neue Converter-Funktion erstellen (ähnlich `glbToNodes.js`)
- [ ] IFC-Scene-Struktur in Hyperfy-Node-Struktur umwandeln
- [ ] IFC-Metadaten optional extrahieren (Properties, Types, etc.)

**Referenz-Implementierung:**
```javascript
import { createNode } from './createNode'

export function ifcToNodes(ifcModel, world) {
  function parse(object3ds, parentNode) {
    for (const object3d of object3ds) {
      // IFC-Meshes zu Hyperfy-Nodes konvertieren
      if (object3d.type === 'Mesh') {
        const node = createNode('mesh', {
          id: object3d.name || object3d.expressID,
          type: 'geometry',
          geometry: object3d.geometry,
          material: object3d.material,
          linked: true,
          castShadow: true,
          receiveShadow: true,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
      // Groups
      else if (object3d.type === 'Group' || object3d.type === 'Object3D') {
        const node = createNode('group', {
          id: object3d.name || object3d.expressID,
          position: object3d.position.toArray(),
          quaternion: object3d.quaternion.toArray(),
          scale: object3d.scale.toArray(),
        })
        parentNode.add(node)
        parse(object3d.children, node)
      }
    }
  }

  const root = createNode('group', { id: '$root' })
  parse(ifcModel.children, root)
  return root
}
```

#### 3.4 IFC-Loading-Logik in ClientLoader.load()
**Datei:** `src/core/systems/ClientLoader.js:113-243`

- [ ] IFC-Typ-Handling hinzufügen (nach dem `model`-Block, Zeile ~187):

```javascript
if (type === 'ifc') {
  const buffer = await file.arrayBuffer()
  const url = URL.createObjectURL(file)
  const ifcModel = await this.ifcLoader.loadAsync(url)

  // IFC-Nodes via Converter erstellen
  const node = ifcToNodes(ifcModel, this.world)

  const ifc = {
    toNodes() {
      return node.clone(true)
    },
    getStats() {
      const stats = node.getStats(true)
      stats.fileBytes = file.size
      return stats
    },
    // Optional: IFC-Metadaten bereitstellen
    getProperties: async (expressID) => {
      return await this.ifcLoader.ifcManager.getItemProperties(ifcModel.modelID, expressID)
    }
  }

  // Cleanup
  URL.revokeObjectURL(url)

  this.results.set(key, ifc)
  return ifc
}
```

#### 3.5 IFC-Insert-Logik für lokale Files
**Datei:** `src/core/systems/ClientLoader.js:245-360`

- [ ] IFC-Insert-Handling hinzufügen (nach dem `model`-Insert-Block, Zeile ~294):

```javascript
if (type === 'ifc') {
  promise = new Promise(async (resolve, reject) => {
    try {
      const ifcModel = await this.ifcLoader.loadAsync(localUrl)
      const node = ifcToNodes(ifcModel, this.world)

      const ifc = {
        toNodes() {
          return node.clone(true)
        },
        getStats() {
          const stats = node.getStats(true)
          stats.fileBytes = file.size
          return stats
        }
      }

      this.results.set(key, ifc)
      resolve(ifc)
    } catch (err) {
      reject(err)
    }
  })
}
```

---

### Phase 4: Server-Loader Implementation (Zeit: 1-2h)

#### 4.1 Server-Side IFC-Handling
**Datei:** `src/core/systems/ServerLoader.js:89-187`

- [ ] IFC-Type analog zu Avatar (Server-Skip) implementieren (nach Zeile 166):

```javascript
if (type === 'ifc') {
  promise = new Promise(async (resolve, reject) => {
    try {
      // NOTE: IFC-Parsing auf dem Server ist zu rechenintensiv
      // Server erstellt nur Platzhalter-Node
      let node
      const ifc = {
        toNodes: () => {
          if (!node) {
            node = createNode('group', { id: '$ifc_placeholder' })
          }
          return node.clone(true)
        },
      }
      this.results.set(key, ifc)
      resolve(ifc)
    } catch (err) {
      reject(err)
    }
  })
}
```

---

### Phase 5: Upload & File-Size Handling (Zeit: 2-3h)

#### 5.1 File-Size Limits prüfen
**Datei:** `src/client/components/Inputs.js` (Upload-Komponente)

- [ ] Maximale Upload-Größe für IFC-Files erhöhen/konfigurieren
- [ ] Progress-Indicator für große IFC-Files hinzufügen
- [ ] Validation für .ifc Extension

#### 5.2 Multipart-Upload Konfiguration
**Server-Seite:** Fastify Multipart Config

- [ ] Maximale Body-Size für IFC-Uploads erhöhen
- [ ] Temporärer Storage für große Files konfigurieren

---

### Phase 6: Testing & Optimization (Zeit: 4-6h)

#### 6.1 Basic Functionality Tests
- [ ] Kleines IFC-File (< 5MB) laden testen
- [ ] Mittleres IFC-File (5-20MB) laden testen
- [ ] Großes IFC-File (> 20MB) laden testen
- [ ] IFC-Model Rendering in Hyperfy-World verifizieren

#### 6.2 Performance-Optimierungen
- [ ] IFC-Parsing in Web Worker verschieben (verhindert UI-Freeze)
- [ ] Geometry-Simplification für große IFC-Models implementieren
- [ ] Level-of-Detail (LOD) für IFC-Nodes hinzufügen
- [ ] Instancing für wiederkehrende IFC-Elemente nutzen

#### 6.3 Metadata-Integration (Optional)
- [ ] IFC-Properties UI erstellen (z.B. Material, Kosten, Hersteller)
- [ ] Property-Set-Abfrage im App-System ermöglichen
- [ ] IFC-Spatial-Hierarchy Navigation

---

### Phase 7: Documentation & Cleanup (Zeit: 2h)

#### 7.1 Code-Dokumentation
- [ ] Inline-Kommentare für IFC-spezifische Logik hinzufügen
- [ ] JSDoc für neue Funktionen (`ifcToNodes`, etc.)

#### 7.2 User-Dokumentation
- [ ] Anleitung für IFC-Upload in Hyperfy
- [ ] Best-Practices für IFC-File-Vorbereitung (Polygon-Reduktion, etc.)
- [ ] Troubleshooting-Sektion

---

## Geschätzte Gesamtzeit: 16-24 Stunden

### Risiken & Mitigation:

1. **Performance bei großen IFC-Files**
   - Mitigation: Web Worker, Geometry-Simplification, progressive Loading

2. **IFC-Format-Variationen**
   - Mitigation: Testen mit IFC2x3, IFC4 und verschiedenen Exportern (Revit, ArchiCAD, etc.)

3. **THREE.js Version-Inkompatibilität**
   - Mitigation: Fork von web-ifc-three mit angepassten Imports falls nötig

4. **Memory Issues bei komplexen Modellen**
   - Mitigation: Geometry-Disposal, Texture-Sharing, LOD-System

---

## Nächste Schritte zum Start:

1. **Phase 1 beginnen**: Dependencies installieren (`npm install web-ifc-three`)
2. **Quick Prototype**: Minimale IFC-Loading-Funktionalität zuerst implementieren
3. **Iteratives Testing**: Jede Phase einzeln testen vor Weiterarbeit
4. **Performance-Monitoring**: FPS & Memory während IFC-Loading tracken