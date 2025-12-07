import { useEffect, useMemo, useState } from 'react'
import {
  Menu,
  MenuItemBack,
  MenuItemBtn,
  MenuItemCurve,
  MenuItemFile,
  MenuItemFileBtn,
  MenuItemNumber,
  MenuItemRange,
  MenuItemSwitch,
  MenuItemText,
  MenuItemTextarea,
  MenuItemToggle,
  MenuLine,
  MenuSection,
} from './Menu'
import { exportApp } from '../../core/extras/appTools'
import { downloadFile } from '../../core/extras/downloadFile'
import { hashFile } from '../../core/utils-client'
import { isArray, isBoolean } from 'lodash-es'
import { css } from '@firebolt-dev/css'

export function MenuApp({ world, app, blur }) {
  const [pages, setPages] = useState(() => ['index'])
  const [blueprint, setBlueprint] = useState(app.blueprint)
  useEffect(() => {
    window.app = app
    const onModify = bp => {
      if (bp.id === blueprint.id) setBlueprint(bp)
    }
    world.blueprints.on('modify', onModify)
    return () => {
      world.blueprints.off('modify', onModify)
    }
  }, [])
  const pop = () => {
    const next = pages.slice()
    next.pop()
    setPages(next)
  }
  const push = page => {
    const next = pages.slice()
    next.push(page)
    setPages(next)
  }
  const page = pages[pages.length - 1]
  let Page
  if (page === 'index') Page = MenuAppIndex
  if (page === 'flags') Page = MenuAppFlags
  if (page === 'metadata') Page = MenuAppMetadata
  if (page === 'ifc-filters') Page = MenuAppIFCFilters
  return (
    <Menu title={blueprint.name} blur={blur}>
      <Page world={world} app={app} blueprint={blueprint} pop={pop} push={push} />
    </Menu>
  )
}

const extToType = {
  glb: 'model',
  vrm: 'avatar',
}
const allowedModels = ['glb', 'vrm']

function MenuAppIndex({ world, app, blueprint, pop, push }) {
  const player = world.entities.player
  const frozen = blueprint.frozen // TODO: disable code editor, model change, metadata editing, flag editing etc
  const changeModel = async file => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!allowedModels.includes(ext)) return
    // immutable hash the file
    const hash = await hashFile(file)
    // use hash as glb filename
    const filename = `${hash}.${ext}`
    // canonical url to this file
    const url = `asset://${filename}`
    // cache file locally so this client can insta-load it
    const type = extToType[ext]
    world.loader.insert(type, url, file)
    // update blueprint locally (also rebuilds apps)
    const version = blueprint.version + 1
    world.blueprints.modify({ id: blueprint.id, version, model: url })
    // upload model
    await world.network.upload(file)
    // broadcast blueprint change to server + other clients
    world.network.send('blueprintModified', { id: blueprint.id, version, model: url })
  }
  const download = async () => {
    try {
      const file = await exportApp(app.blueprint, world.loader.loadFile)
      downloadFile(file)
    } catch (err) {
      console.error(err)
    }
  }
  // Check if this is an IFC model
  const isIFC = blueprint.model?.endsWith('.ifc') || blueprint.model?.includes('.ifc')
  const rootNode = isIFC ? app.getNodes() : null
  const hasIFCData = rootNode?.userData?.ifcTypeStats && Object.keys(rootNode.userData.ifcTypeStats).length > 0

  return (
    <>
      <MenuItemFields world={world} app={app} blueprint={blueprint} />
      {app.fields?.length > 0 && <MenuLine />}
      {!frozen && (
        <MenuItemFileBtn
          label='Model'
          hint='Change the model for this app'
          accept='.glb,.vrm'
          value={blueprint.model}
          onChange={changeModel}
        />
      )}
      {!frozen && <MenuItemBtn label='Code' hint='View or edit the code for this app' onClick={world.ui.toggleCode} />}
      {!frozen && <MenuItemBtn label='Flags' hint='View/edit flags for this app' onClick={() => push('flags')} nav />}
      <MenuItemBtn label='Metadata' hint='View/edit metadata for this app' onClick={() => push('metadata')} nav />
      {isIFC && hasIFCData && (
        <MenuItemBtn label='IFC Filters' hint='Show/hide IFC elements by type' onClick={() => push('ifc-filters')} nav />
      )}
      <MenuItemBtn label='Download' hint='Download this app as a .hyp file' onClick={download} />
      <MenuItemBtn
        label='Delete'
        hint='Delete this app instance'
        onClick={() => {
          world.ui.setMenu(null)
          app.destroy(true)
        }}
      />
    </>
  )
}

function MenuItemFields({ world, app, blueprint }) {
  const [fields, setFields] = useState(() => app.fields)
  const props = blueprint.props
  useEffect(() => {
    app.onFields = setFields
    return () => {
      app.onFields = null
    }
  }, [])
  const modify = (key, value) => {
    if (props[key] === value) return
    const bp = world.blueprints.get(blueprint.id)
    const newProps = { ...bp.props, [key]: value }
    // update blueprint locally (also rebuilds apps)
    const id = bp.id
    const version = bp.version + 1
    world.blueprints.modify({ id, version, props: newProps })
    // broadcast blueprint change to server + other clients
    world.network.send('blueprintModified', { id, version, props: newProps })
  }
  return fields.map(field => (
    <MenuItemField key={field.key} world={world} props={props} field={field} value={props[field.key]} modify={modify} />
  ))
}

function MenuItemField({ world, props, field, value, modify }) {
  if (field.hidden) {
    return null
  }
  if (field.when && isArray(field.when)) {
    for (const rule of field.when) {
      if (rule.op === 'eq' && props[rule.key] !== rule.value) {
        return null
      }
    }
  }
  if (field.type === 'section') {
    return <MenuSection label={field.label} />
  }
  if (field.type === 'text') {
    return (
      <MenuItemText
        label={field.label}
        hint={field.hint}
        placeholder={field.placeholder}
        value={value}
        onChange={value => modify(field.key, value)}
      />
    )
  }
  if (field.type === 'textarea') {
    return (
      <MenuItemTextarea
        label={field.label}
        hint={field.hint}
        value={value}
        onChange={value => modify(field.key, value)}
      />
    )
  }
  if (field.type === 'number') {
    return (
      <MenuItemNumber
        label={field.label}
        hint={field.hint}
        dp={field.dp}
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={value => modify(field.key, value)}
      />
    )
  }
  if (field.type === 'file') {
    return (
      <MenuItemFile
        label={field.label}
        hint={field.hint}
        kind={field.kind}
        value={value}
        onChange={value => modify(field.key, value)}
        world={world}
      />
    )
  }
  if (field.type === 'switch') {
    return (
      <MenuItemSwitch
        label={field.label}
        hint={field.hint}
        options={field.options}
        value={value}
        onChange={value => modify(field.key, value)}
      />
    )
  }
  if (field.type === 'dropdown') {
    // deprecated, same as switch
    return (
      <MenuItemSwitch
        label={field.label}
        hint={field.hint}
        options={field.options}
        value={value}
        onChange={value => modify(field.key, value)}
      />
    )
  }
  if (field.type === 'toggle') {
    return (
      <MenuItemToggle
        label={field.label}
        hint={field.hint}
        trueLabel={field.trueLabel}
        falseLabel={field.falseLabel}
        value={value}
        onChange={value => modify(field.key, value)}
      />
    )
  }
  if (field.type === 'range') {
    return (
      <MenuItemRange
        label={field.label}
        hint={field.hint}
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={value => modify(field.key, value)}
      />
    )
  }
  if (field.type === 'curve') {
    return (
      <MenuItemCurve
        label={field.label}
        hint={field.hint}
        yMin={field.yMin}
        yMax={field.yMax}
        value={value}
        onChange={value => modify(field.key, value)}
      />
    )
  }
  if (field.type === 'button') {
    return <MenuItemBtn label={field.label} hint={field.hint} onClick={field.onClick} />
  }
  return null
}

function MenuAppFlags({ world, app, blueprint, pop, push }) {
  const player = world.entities.player
  const toggle = async (key, value) => {
    value = isBoolean(value) ? value : !blueprint[key]
    if (blueprint[key] === value) return
    const version = blueprint.version + 1
    world.blueprints.modify({ id: blueprint.id, version, [key]: value })
    world.network.send('blueprintModified', { id: blueprint.id, version, [key]: value })
  }
  return (
    <>
      <MenuItemBack hint='Go back to the main app details' onClick={pop} />
      <MenuItemToggle
        label='Preload'
        hint='Preload this app before players enter the world'
        value={blueprint.preload}
        onChange={value => toggle('preload', value)}
      />
      <MenuItemToggle
        label='Lock'
        hint='Lock the app so that after downloading it the model, script and metadata can no longer be edited'
        value={blueprint.locked}
        onChange={value => toggle('locked', value)}
      />
      <MenuItemToggle
        label='Unique'
        hint='When duplicating this app in the world, create a completely new and unique instance with its own separate config'
        value={blueprint.unique}
        onChange={value => toggle('unique', value)}
      />
    </>
  )
}

function MenuAppMetadata({ world, app, blueprint, pop, push }) {
  const player = world.entities.player
  const set = async (key, value) => {
    const version = blueprint.version + 1
    world.blueprints.modify({ id: blueprint.id, version, [key]: value })
    world.network.send('blueprintModified', { id: blueprint.id, version, [key]: value })
  }
  return (
    <>
      <MenuItemBack hint='Go back to the main app details' onClick={pop} />
      <MenuItemText
        label='Name'
        hint='The name of this app'
        value={blueprint.name}
        onChange={value => set('name', value)}
      />
      <MenuItemFile
        label='Image'
        hint='An image/icon for this app'
        kind='texture'
        value={blueprint.image}
        onChange={value => set('image', value)}
        world={world}
      />
      <MenuItemText
        label='Author'
        hint='The name of the author that made this app'
        value={blueprint.author}
        onChange={value => set('author', value)}
      />
      <MenuItemText label='URL' hint='A url for this app' value={blueprint.url} onChange={value => set('url', value)} />
      <MenuItemTextarea
        label='Description'
        hint='A description for this app'
        value={blueprint.desc}
        onChange={value => set('desc', value)}
      />
    </>
  )
}

function MenuAppIFCFilters({ world, app, blueprint, pop, push }) {
  const rootNode = app.getNodes()
  const ifcTypeStats = rootNode?.userData?.ifcTypeStats || {}
  const ifcExpressIDToType = rootNode?.userData?.ifcExpressIDToType || new Map()

  // State to track visibility per type
  const [typeVisibility, setTypeVisibility] = useState(() => {
    const initial = {}
    Object.keys(ifcTypeStats).forEach(type => {
      initial[type] = true
    })
    return initial
  })

  // Helper function to traverse nodes safely
  const traverseNodes = (callback) => {
    if (!rootNode) return
    const traverse = (node) => {
      callback(node)
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => traverse(child))
      }
    }
    traverse(rootNode)
  }

  // Toggle visibility for a specific IFC type
  const toggleType = (typeName) => {
    const newVisibility = !typeVisibility[typeName]
    setTypeVisibility(prev => ({ ...prev, [typeName]: newVisibility }))

    // Find all nodes with this type and toggle visibility
    traverseNodes(node => {
      if (node.userData?.ifcType === typeName) {
        // Use active property for Hyperfy nodes, visible for Three.js objects
        if ('active' in node) {
          node.active = newVisibility
        } else if ('visible' in node) {
          node.visible = newVisibility
        }
      }
    })

    console.log('[IFC Filters] Toggled', typeName, 'to', newVisibility)
  }

  // Show/Hide all
  const toggleAll = (visible) => {
    const newVisibility = {}
    Object.keys(ifcTypeStats).forEach(type => {
      newVisibility[type] = visible
    })
    setTypeVisibility(newVisibility)

    // Update all nodes
    traverseNodes(node => {
      if (node.userData?.ifcType) {
        if ('active' in node) {
          node.active = visible
        } else if ('visible' in node) {
          node.visible = visible
        }
      }
    })

    console.log('[IFC Filters] Set all types to', visible)
  }

  // Format type name for display (remove IFC prefix)
  const formatTypeName = (typeName) => {
    return typeName.replace(/^IFC/, '')
  }

  return (
    <>
      <MenuItemBack hint='Go back to the main app details' onClick={pop} />
      <MenuSection>IFC Element Types</MenuSection>
      <div
        css={css`
          display: flex;
          gap: 0.5rem;
          padding: 0 1rem;
          margin-bottom: 0.5rem;
        `}
      >
        <MenuItemBtn label='Show All' onClick={() => toggleAll(true)} />
        <MenuItemBtn label='Hide All' onClick={() => toggleAll(false)} />
      </div>
      {Object.entries(ifcTypeStats)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .map(([typeName, count]) => (
          <MenuItemToggle
            key={typeName}
            label={`${formatTypeName(typeName)} (${count})`}
            hint={`Show/hide ${count} ${formatTypeName(typeName).toLowerCase()} elements`}
            value={typeVisibility[typeName] ?? true}
            onChange={() => toggleType(typeName)}
          />
        ))}
    </>
  )
}
