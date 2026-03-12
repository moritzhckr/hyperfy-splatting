# WebView

Embeds an interactive iframe in either 3D world space or 2D screen space. WebViews support both rendering modes:

- **World Space**: Iframes positioned in 3D space using CSS3D rendering with proper depth occlusion, allowing 3D objects to pass in front naturally.
- **Screen Space**: Iframes positioned as 2D overlays using CSS absolute positioning, like traditional UI elements.

When players click on a WebView, their pointer is unlocked so they can interact with the iframe content (world space mode only).

## Properties

### `.space`: String ('world' | 'screen')

The rendering space for the WebView. Defaults to `'world'`.

- **`'world'`**: Renders the iframe in 3D space using CSS3D. The iframe can be positioned, rotated, and scaled like any 3D object. 3D objects can occlude the iframe. Requires `width` and `height` in meters.
- **`'screen'`**: Renders the iframe as a 2D overlay on the screen. The iframe is positioned using percentages and pixel offsets, like UI nodes. Requires `width` and `height` in pixels. The `position` property uses percentages (0-1 for x/y) and z for z-index.

**Important**: When changing `space`, you'll likely need to adjust `width`, `height`, and `position` values to match the new coordinate system.

### `.src`: String

A URL to load in the iframe. This can be any website that allows iframe embedding.

Note: Some websites block embedding via `X-Frame-Options` headers.

### `.width`: Number

The width of the WebView surface. Defaults to `1`.

- **World space**: Width in meters (physical size in 3D world)
- **Screen space**: Width in pixels

### `.height`: Number

The height of the WebView surface. Defaults to `1`.

- **World space**: Height in meters (physical size in 3D world)
- **Screen space**: Height in pixels

### `.factor`: Number

**World space only.** The resolution scaling factor. Higher values produce sharper content but use more memory. Defaults to `100`.

The actual iframe pixel dimensions are calculated as: `width * factor` by `height * factor`.

For high-detail content like charts or text, use values between `150-300`. For simple content, `100` is sufficient.

This property has no effect in screen space mode.

### `.doubleside`: Boolean

**World space only.** Whether the WebView should render on both sides of the plane. Defaults to `false` (single-sided).

When `true`, the iframe content is visible from both the front and back of the plane. When `false`, it's only visible from the front.

This property has no effect in screen space mode.

### `.onPointerDown`: Function

**World space only.** Callback function triggered when a player clicks on the WebView.

By default, clicking unlocks the pointer to allow iframe interaction. In build mode, pointer unlocking is automatically prevented. You can override this behavior by setting a custom `onPointerDown` handler and calling `e.preventDefault()`.

In screen space mode, the iframe is always interactive and pointer events work like regular DOM elements.

```javascript
webview.onPointerDown = (e) => {
  console.log('WebView clicked')
  e.preventDefault() // Prevents default pointer unlock behavior
}
```

### `.{...Node}`

Inherits all [Node](/docs/scripting/nodes/Node.md) properties

## Examples

### Basic Website Embed

```javascript
const webview = app.create('webview', {
  src: 'https://example.com',
  width: 2,
  height: 1.5,
  position: [0, 1.5, 0],
})
app.add(webview)
```