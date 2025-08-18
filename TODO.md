# Gaussian Splatting TODO - Hyperfy Integration

## 🚨 Kritische Bugs (Priorität 1)

### Loading & Timing Issues
- [ ] **Fix asynchroner Loading State Bug** (GaussianSplat.js:67-81)
  - Loading state wird gesetzt bevor Datei geladen ist
  - `this.loadingState = 'loaded'` erst nach erfolgreicher SplatMesh creation

- [ ] **SPZ Format Loading Reparieren**
  - SPZ files werfen gzip error
  - Hardcoded timeout durch proper event handling ersetzen
  - Alternative: SPZ support komplett entfernen und nur PLY/KSPLAT/SPLAT unterstützen

- [ ] **Matrix Update Race Condition** (Stage.js:315-333)
  - `setTimeout(() => {}, 0)` durch deterministische Lösung ersetzen
  - Proper matrix update lifecycle implementieren

### Handle & Visibility Issues
- [ ] **Cube Handle Visibility Toggle reparieren** (apps/GaussianSplat.js:61-63)
  - `cubeHandle.visible = props.showCube` funktioniert nicht zuverlässig
  - Debugging: Warum wird handle nicht sichtbar/unsichtbar?
  - Möglicherweise rendering pipeline issue

## ⚠️ Wichtige Verbesserungen (Priorität 2)

### Error Handling
- [ ] **Error Recovery verbessern** (apps/GaussianSplat.js:86-88)
  - User feedback bei loading errors
  - `lastSplatFile = null` für retry logic
  - UI indicator für error states

- [ ] **Sort Mode Update Validation** (GaussianSplat.js:92-99)
  - Direct property access validieren
  - Fallback wenn SplatMesh sortMode nicht unterstützt wird

### Code Quality
- [ ] **Unused SplatLoader Import entfernen** (Stage.js:3)
  - `SplatLoader` wird nicht verwendet
  - Cleanup: nur benötigte imports

- [ ] **Consistent Error Messages**
  - Alle console.error mit einheitlichem Format
  - Error codes für debugging

## 🔧 Technische Verbesserungen (Priorität 3)

### Performance
- [ ] **Loading Progress Indicator**
  - Real-time loading feedback für große splat files
  - Progress events von Spark.js nutzen

- [ ] **Memory Management**
  - Proper disposal von SplatMesh bei component unmount
  - Memory leak prevention

### Developer Experience
- [ ] **Better Debug Logging**
  - Structured logging für splat loading pipeline
  - Debug mode für verbose output

- [ ] **File Format Support Matrix**
  - Dokumentation welche Formate wirklich funktionieren
  - Runtime validation von file types

## 📝 Spezifische Code Locations

### Files zu bearbeiten:
- `apps/GaussianSplat.js` - App interface & handle visibility
- `src/core/nodes/GaussianSplat.js` - Node loading logic
- `src/core/systems/Stage.js` - SplatMesh creation & SPZ handling
- `src/core/systems/ClientLoader.js` - File loading pipeline

### Test Cases:
- [ ] PLY file loading
- [ ] KSPLAT file loading  
- [ ] SPLAT file loading
- [ ] SPZ file loading (fix or remove)
- [ ] Handle visibility toggle
- [ ] Error recovery scenarios

---

**Nächste Schritte:**
1. SPZ loading problem debuggen
2. Handle visibility issue fixen
3. Async loading timing reparieren
4. Error handling verbessern