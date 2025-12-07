# ThatOpen Components Integration - Wichtige Erkenntnisse

## FragmentsManager Dokumentation Zusammenfassung

Basierend auf: https://docs.thatopen.com/Tutorials/Components/Core/FragmentsManager

### 🎯 Kernkonzepte

#### 1. FragmentsManager Architektur
- **FragmentsManager** ist ein Wrapper um `FragmentsModels` aus `@thatopen/fragments`
- Worker-basierte Architektur: Die meisten Operationen (Datenabruf, Sichtbarkeit, Farben, etc.) laufen in einem separaten Thread
- Dies hält die App während der Verarbeitung responsiv

#### 2. Initialisierung
```javascript
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl); // Worker-URL ist erforderlich
```

**Wichtig**: 
- Initialisierung sollte nur **einmal** für die gesamte App-Instanz erfolgen
- Worker-URL kann lokal sein (im public-Verzeichnis) oder extern
- Beispiel: `"https://thatopen.github.io/engine_fragment/resources/worker.mjs"`

#### 3. Fragments Laden

**Für bereits exportierte .frag Dateien:**
```javascript
const file = await fetch(path);
const buffer = await file.arrayBuffer();
const model = await fragments.core.load(buffer, { modelId });
```

**Für IFC-Dateien:**
- `IfcLoader` konvertiert IFC zu Fragments
- `ifcLoader.load()` erstellt Fragments und fügt sie zu `fragments.list` hinzu
- **Empfehlung**: IFC einmal zu Fragments konvertieren und dann Fragments laden (10x schneller!)

#### 4. Fragment-Modell Struktur

Ein `FragmentsModel` hat folgende wichtige Properties:
- `model.modelId`: Eindeutige ID des Modells
- `model.object`: Das Three.js `Object3D` für die Szene
- `model.isBusy`: Boolean, zeigt ob das Modell noch geladen wird
- `model.useCamera(camera)`: Setzt die Kamera für Culling/LOD-Updates

#### 5. Fragment-Liste Management

```javascript
// Zugriff auf alle geladenen Modelle
fragments.list // DataMap<string, FragmentsModel>

// Events für neue/entfernte Modelle
fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
});

fragments.list.onItemDeleted.add(({ value: model }) => {
  // Cleanup wenn Modell entfernt wird
});
```

#### 6. Performance-Optimierung

**Culling und LOD Updates:**
```javascript
// Nach Camera-Bewegungen updaten
world.camera.controls.addEventListener("rest", () =>
  fragments.core.update(true),
);

// Nach dem Laden eines Modells updaten
fragments.core.update(true);
```

#### 7. Modell Export/Dispose

```javascript
// Exportieren
const fragsBuffer = await model.getBuffer(false);
const file = new File([fragsBuffer], `${model.modelId}.frag`);

// Entfernen
fragments.core.disposeModel(modelId);
```

---

## 🔧 Wichtige Erkenntnisse für unsere Implementierung

### Problem: `ifcLoader.load()` Promise hängt

**Lösung basierend auf Dokumentation:**
1. `ifcLoader.load()` erstellt Fragments und fügt sie zu `fragments.list` hinzu
2. Das Promise kann hängen, aber das Fragment wird trotzdem erstellt
3. **Besserer Ansatz**: Auf `fragments.list.onItemSet` Event warten oder Fragment-Status prüfen

### Problem: Fragment bleibt `isBusy: true` obwohl `object` vorhanden ist

**Lösung:**
- `isBusy` kann `true` bleiben für Hintergrund-Verarbeitung (Metadaten, etc.)
- **Wichtig**: Wenn `fragment.object` vorhanden ist, ist das Fragment **bereit für Rendering**
- Wir sollten das Fragment verwenden, sobald `fragment.object` existiert
- `fragments.core.update(true)` aufrufen, um den Status zu aktualisieren

### Korrekte Implementierung

```javascript
// 1. IFC-Datei lesen
const modelID = await ifcLoader.readIfcFile(typedArray);

// 2. Load starten (Promise kann hängen)
const loadPromise = ifcLoader.load(typedArray, true, filename);

// 3. Auf Fragment in fragments.list warten
// Option A: Event-basiert
fragments.list.onItemSet.add(({ value: model }) => {
  if (model.modelId === modelID) {
    // Fragment ist bereit!
    fragmentsModel = model;
  }
});

// Option B: Polling (wenn Event nicht funktioniert)
while (waited < maxWaitTime) {
  const fragments = Array.from(fragments.list.values());
  const fragment = fragments.find(f => f.modelId === modelID);
  
  if (fragment && !fragment.isBusy && fragment.object) {
    fragmentsModel = fragment;
    break;
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  waited += 500;
}
```

### Fragment zu Three.js Object3D

```javascript
// Fragment hat direkt ein .object Property
const threeObject = fragmentsModel.object; // THREE.Object3D

// Für Hyperfy: In Group wrappen
const group = new THREE.Group();
group.add(threeObject);
group.userData = {
  ifcModelID: fragmentsModel.modelId,
  fragmentsModel: fragmentsModel,
};
```

### Worker Setup

**Aktuell**: Wir verwenden `fragments.init('')` (kein Worker)
**Empfehlung**: Worker verwenden für bessere Performance bei großen IFC-Dateien

```javascript
// Worker-URL setzen
const workerUrl = '/worker.mjs'; // Lokal im public-Verzeichnis
// Oder: 'https://thatopen.github.io/engine_fragment/resources/worker.mjs'
fragments.init(workerUrl);
```

---

## 📝 Checkliste für unsere Implementierung

- [x] FragmentsManager initialisiert
- [x] IfcLoader setup mit WASM-Pfad
- [x] `readIfcFile()` für IFC-Parsing
- [x] `ifcLoader.load()` starten
- [x] Auf Fragment-Status warten (isBusy === false)
- [ ] Event-basiertes Laden implementieren (besser als Polling)
- [ ] Worker für bessere Performance hinzufügen
- [ ] `fragments.core.update()` nach Camera-Bewegungen
- [ ] Fragment-Metadaten korrekt extrahieren
- [ ] Fragment zu Hyperfy Nodes konvertieren

---

## 🔗 Weitere Ressourcen

- [FragmentsManager Tutorial](https://docs.thatopen.com/Tutorials/Components/Core/FragmentsManager)
- [IfcLoader Tutorial](https://docs.thatopen.com/Tutorials/Components/Core/IfcLoader)
- [ThatOpen Components GitHub](https://github.com/ThatOpen/engine_components)

