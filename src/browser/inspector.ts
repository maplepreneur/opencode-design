import type { ComponentInfo, ElementSelection, Rect } from "../shared/types"

export const INSPECTOR_GLOBAL = "__opencode_design_mode_v1__"

export type InspectorMethod = "poll" | "prepareCapture" | "finishCapture" | "cancel"

/**
 * Runs inside the inspected page. Everything it needs is deliberately scoped
 * inside this function so Function#toString produces a standalone script.
 */
function inspectorMain(requestID: string) {
  type Status = "active" | "selected" | "cancelled"
  type Instance = {
    status: Status
    selection: ElementSelection | undefined
    hover: Element | undefined
    prepare: () => void
    finish: () => void
    destroy: () => void
  }
  type Registry = {
    instances: Record<string, Instance>
    poll: (id: string) => unknown
    prepareCapture: (id: string) => Promise<boolean>
    finishCapture: (id: string) => boolean
    cancel: (id: string) => boolean
  }

  const globalKey = "__opencode_design_mode_v1__"
  const targetWindow = window as unknown as Record<string, Registry | undefined>
  let registry = targetWindow[globalKey]

  if (!registry) {
    const instances: Record<string, Instance> = {}
    registry = {
      instances,
      poll(id) {
        const instance = instances[id]
        if (!instance) return null
        if (instance.status === "selected" && instance.selection) {
          return { type: "selected", selection: instance.selection }
        }
        return { type: instance.status }
      },
      async prepareCapture(id) {
        const instance = instances[id]
        if (!instance || instance.status !== "selected") return false
        instance.prepare()
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return true
      },
      finishCapture(id) {
        const instance = instances[id]
        if (!instance) return false
        instance.finish()
        return true
      },
      cancel(id) {
        const instance = instances[id]
        if (!instance) return false
        instance.destroy()
        return true
      },
    }
    Object.defineProperty(targetWindow, globalKey, {
      value: registry,
      configurable: true,
      enumerable: false,
      writable: false,
    })
  }

  const currentRegistry = registry
  let status: Status = "active"
  let selection: ElementSelection | undefined
  let hover: Element | undefined

  const host = document.createElement("div")
  host.setAttribute("data-design-mode-inspector", requestID)
  host.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "pointer-events:none",
    "display:block",
  ].join(";")
  const shadow = host.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  style.textContent = `
    :host { all: initial; }
    .box, .capture, .label { position: fixed; box-sizing: border-box; pointer-events: none; }
    .box {
      border: 1.5px solid #7c5cff;
      background: rgba(124, 92, 255, .13);
      box-shadow: 0 0 0 1px rgba(255,255,255,.45) inset;
    }
    .capture {
      display: none;
      border: 3px solid #ff3d81;
      background: rgba(255, 61, 129, .08);
      box-shadow: 0 0 0 1px rgba(255,255,255,.9) inset, 0 0 0 2px rgba(0,0,0,.18);
    }
    .label {
      max-width: min(440px, calc(100vw - 16px));
      padding: 5px 8px;
      border-radius: 5px;
      background: #6c47f5;
      color: white;
      font: 500 12px/16px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: .01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 2px 10px rgba(0,0,0,.25);
    }
  `
  const box = document.createElement("div")
  box.className = "box"
  box.style.display = "none"
  const capture = document.createElement("div")
  capture.className = "capture"
  const label = document.createElement("div")
  label.className = "label"
  label.style.display = "none"
  shadow.append(style, box, capture, label)
  document.documentElement.appendChild(host)

  const previousCursor = document.documentElement.style.cursor
  document.documentElement.style.cursor = "crosshair"

  function position(node: HTMLElement, rect: Rect) {
    node.style.left = `${rect.x}px`
    node.style.top = `${rect.y}px`
    node.style.width = `${Math.max(0, rect.width)}px`
    node.style.height = `${Math.max(0, rect.height)}px`
  }

  function rectOf(element: Element): Rect {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }

  function componentName(element: Element) {
    const components = resolveComponents(element)
    return components[0]?.name
  }

  function drawHover(element: Element) {
    if (status !== "active") return
    hover = element
    const rect = rectOf(element)
    position(box, rect)
    box.style.display = "block"
    capture.style.display = "none"
    const component = componentName(element)
    label.textContent = component ? `${component}  ·  ${elementLabel(element)}` : elementLabel(element)
    label.style.display = "block"
    const labelWidth = Math.min(440, Math.max(120, label.textContent.length * 7 + 18))
    const left = Math.max(8, Math.min(rect.x, window.innerWidth - labelWidth - 8))
    const top = rect.y >= 36 ? rect.y - 28 : Math.min(window.innerHeight - 28, rect.y + rect.height + 8)
    label.style.left = `${left}px`
    label.style.top = `${Math.max(4, top)}px`
    label.style.width = "max-content"
  }

  function drawCapture() {
    if (!selection) return
    box.style.display = "none"
    label.style.display = "none"
    position(capture, selection.rect)
    capture.style.display = "block"
  }

  function elementLabel(element: Element) {
    const tag = element.tagName.toLowerCase()
    const id = element.id ? `#${element.id}` : ""
    const firstClass = Array.from(element.classList)[0]
    return `${tag}${id}${firstClass && !id ? `.${firstClass}` : ""}`
  }

  function targetFrom(event: Event) {
    for (const item of event.composedPath()) {
      if (item instanceof Element && item !== host && item.isConnected) return item
    }
    return event.target instanceof Element && event.target !== host ? event.target : undefined
  }

  function swallow(event: Event) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function onMove(event: MouseEvent) {
    if (status !== "active") return
    const target = targetFrom(event)
    if (target) drawHover(target)
  }

  function onDown(event: Event) {
    if (status === "active") swallow(event)
  }

  function onClick(event: MouseEvent) {
    if (status !== "active") return
    swallow(event)
    const element = hover?.isConnected ? hover : targetFrom(event)
    if (!element) return
    selection = describeElement(element)
    status = "selected"
    hover = undefined
    document.documentElement.style.cursor = previousCursor
    drawCapture()
  }

  function onKey(event: KeyboardEvent) {
    if (status !== "active") return
    if (event.key === "Escape") {
      swallow(event)
      status = "cancelled"
      host.style.display = "none"
      document.documentElement.style.cursor = previousCursor
      return
    }
    if (!["Shift", "Control", "Meta", "Alt"].includes(event.key)) swallow(event)
  }

  function onReposition() {
    if (status === "active" && hover?.isConnected) drawHover(hover)
  }

  function prevent(event: Event) {
    if (status === "active") swallow(event)
  }

  const observer = new MutationObserver(() => {
    if (!host.isConnected && status !== "cancelled") document.documentElement.appendChild(host)
  })
  observer.observe(document.documentElement, { childList: true })

  window.addEventListener("pointermove", onMove, true)
  window.addEventListener("pointerdown", onDown, true)
  window.addEventListener("mousedown", onDown, true)
  window.addEventListener("mouseup", onDown, true)
  window.addEventListener("click", onClick, true)
  window.addEventListener("keydown", onKey, true)
  window.addEventListener("submit", prevent, true)
  window.addEventListener("dragstart", prevent, true)
  window.addEventListener("resize", onReposition, true)
  window.addEventListener("scroll", onReposition, true)

  function destroy() {
    observer.disconnect()
    window.removeEventListener("pointermove", onMove, true)
    window.removeEventListener("pointerdown", onDown, true)
    window.removeEventListener("mousedown", onDown, true)
    window.removeEventListener("mouseup", onDown, true)
    window.removeEventListener("click", onClick, true)
    window.removeEventListener("keydown", onKey, true)
    window.removeEventListener("submit", prevent, true)
    window.removeEventListener("dragstart", prevent, true)
    window.removeEventListener("resize", onReposition, true)
    window.removeEventListener("scroll", onReposition, true)
    host.remove()
    document.documentElement.style.cursor = previousCursor
    delete currentRegistry.instances[requestID]
  }

  currentRegistry.instances[requestID] = {
    get status() {
      return status
    },
    get selection() {
      return selection
    },
    get hover() {
      return hover
    },
    prepare() {
      host.style.display = "block"
      drawCapture()
    },
    finish() {
      host.style.display = "none"
    },
    destroy,
  }

  function describeElement(element: Element): ElementSelection {
    const components = resolveComponents(element)
    const framework = detectFramework(element, components)
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500)
    const description: ElementSelection = {
      url: location.href,
      title: document.title,
      label: elementLabel(element),
      tag: element.tagName.toLowerCase(),
      selector: stableSelector(element),
      xpath: xpath(element),
      html: trimmedHTML(element),
      classes: Array.from(element.classList).slice(0, 30),
      styles: describedStyles(element),
      rect: rectOf(element),
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      components,
      ...(text ? { text } : {}),
      ...(framework ? { framework } : {}),
    }
    return description
  }

  function cssEscape(value: string) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value)
    return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0)?.toString(16)} `)
  }

  function unique(root: Document | ShadowRoot, selector: string, element: Element) {
    try {
      const matches = root.querySelectorAll(selector)
      return matches.length === 1 && matches[0] === element
    } catch {
      return false
    }
  }

  function selectorInRoot(element: Element, root: Document | ShadowRoot): string {
    if (element.id) {
      const selector = `#${cssEscape(element.id)}`
      if (unique(root, selector, element)) return selector
    }

    for (const attribute of ["data-testid", "data-test", "data-cy", "data-qa"]) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      const selector = `${element.tagName.toLowerCase()}[${attribute}=${JSON.stringify(value)}]`
      if (unique(root, selector, element)) return selector
    }

    const parts: string[] = []
    let current: Element | null = element
    while (current && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase()
      const parent: Element | null = current.parentElement
      if (!parent) {
        parts.unshift(tag)
        break
      }
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current?.tagName)
      const index = siblings.indexOf(current) + 1
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
      const selector = parts.join(" > ")
      if (unique(root, selector, element)) return selector
      current = parent
      if (parts.length > 8) break
    }
    return parts.join(" > ") || element.tagName.toLowerCase()
  }

  function stableSelector(element: Element): string {
    const segments: string[] = []
    let current: Element | null = element
    let guard = 0
    while (current && guard++ < 8) {
      const root = current.getRootNode()
      if (root instanceof ShadowRoot) {
        segments.unshift(selectorInRoot(current, root))
        current = root.host
        continue
      }
      segments.unshift(selectorInRoot(current, document))
      break
    }
    return segments.join(" >>> ")
  }

  function xpathLiteral(value: string) {
    if (!value.includes("'")) return `'${value}'`
    if (!value.includes('"')) return `"${value}"`
    return `concat('${value.replace(/'/g, `', "'", '`)}')`
  }

  function xpath(element: Element) {
    if (element.id) return `//*[@id=${xpathLiteral(element.id)}]`
    const parts: string[] = []
    let current: Element | null = element
    while (current && current !== document.documentElement && parts.length < 16) {
      const tag = current.tagName.toLowerCase()
      const parent: Element | null = current.parentElement
      if (!parent) break
      const siblings = Array.from(parent.children).filter((child) => child.tagName.toLowerCase() === tag)
      const index = siblings.indexOf(current) + 1
      parts.unshift(`${tag}[${index}]`)
      current = parent
    }
    return `/${parts.join("/")}`
  }

  function trimmedHTML(element: Element): string {
    function clean(source: Element, depth: number): Element {
      const clone = source.cloneNode(false) as Element
      for (const attribute of Array.from(clone.attributes)) {
        if (/^on/i.test(attribute.name) || attribute.name === "srcdoc" || attribute.name.startsWith("data-design-mode")) {
          clone.removeAttribute(attribute.name)
          continue
        }
        if (attribute.value.length > 200) clone.setAttribute(attribute.name, `${attribute.value.slice(0, 197)}…`)
      }
      if (["SCRIPT", "STYLE"].includes(source.tagName)) {
        clone.textContent = "…"
        return clone
      }
      if (depth >= 3) {
        if (source.childNodes.length) clone.textContent = "…"
        return clone
      }
      for (const child of Array.from(source.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          clone.appendChild(document.createTextNode((child.textContent ?? "").slice(0, 200)))
        } else if (child instanceof Element) {
          clone.appendChild(clean(child, depth + 1))
        }
      }
      return clone
    }
    const html = clean(element, 0).outerHTML
    return html.length > 6000 ? `${html.slice(0, 5999)}…` : html
  }

  function describedStyles(element: Element) {
    const computed = getComputedStyle(element)
    const properties = [
      "display",
      "position",
      "boxSizing",
      "color",
      "backgroundColor",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "textAlign",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderRadius",
      "width",
      "height",
      "gap",
      "alignItems",
      "justifyContent",
      "flexDirection",
      "gridTemplateColumns",
      "boxShadow",
      "opacity",
      "zIndex",
    ]
    const result: Record<string, string> = {}
    for (const property of properties) {
      const value = computed.getPropertyValue(property) || (computed as unknown as Record<string, string>)[property]
      if (value) result[property] = value
    }
    return result
  }

  function sourceOf(value: unknown): ComponentInfo["source"] | undefined {
    if (!value || typeof value !== "object") return undefined
    const source = value as { fileName?: unknown; lineNumber?: unknown; columnNumber?: unknown }
    if (typeof source.fileName !== "string" || source.fileName.includes("node_modules")) return undefined
    return {
      fileName: source.fileName,
      ...(typeof source.lineNumber === "number" ? { lineNumber: source.lineNumber } : {}),
      ...(typeof source.columnNumber === "number" ? { columnNumber: source.columnNumber } : {}),
    }
  }

  function typeName(type: unknown): string | undefined {
    if (!type || (typeof type !== "function" && typeof type !== "object")) return undefined
    const value = type as {
      displayName?: unknown
      name?: unknown
      __name?: unknown
      __file?: unknown
    }
    for (const name of [value.displayName, value.name, value.__name]) {
      if (typeof name === "string" && name && !["Fragment", "Anonymous"].includes(name)) return name
    }
    if (typeof value.__file === "string") {
      const file = value.__file.split("/").pop()
      return file?.replace(/\.[^.]+$/, "") || undefined
    }
    return undefined
  }

  function resolveComponents(element: Element): ComponentInfo[] {
    const result: ComponentInfo[] = []
    const seen = new Set<string>()
    const add = (name: string | undefined, source?: ComponentInfo["source"]) => {
      if (!name) return
      const key = `${name}:${source?.fileName ?? ""}:${source?.lineNumber ?? ""}`
      if (seen.has(key)) return
      seen.add(key)
      result.push({ name, ...(source ? { source } : {}) })
    }

    const record = element as unknown as Record<string, unknown>
    const fiberKey = Object.getOwnPropertyNames(record).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
    )
    let fiber = fiberKey ? record[fiberKey] : undefined
    let depth = 0
    while (fiber && typeof fiber === "object" && depth++ < 30 && result.length < 10) {
      const current = fiber as {
        type?: unknown
        return?: unknown
        _debugSource?: unknown
        _debugOwner?: unknown
      }
      add(typeName(current.type), sourceOf(current._debugSource))
      fiber = current.return
    }

    let vue = record.__vueParentComponent
    depth = 0
    while (vue && typeof vue === "object" && depth++ < 20 && result.length < 10) {
      const current = vue as { type?: unknown; parent?: unknown }
      const source =
        current.type && typeof current.type === "object" && "__file" in current.type
          ? sourceOf({ fileName: (current.type as { __file?: unknown }).__file })
          : undefined
      add(typeName(current.type), source)
      vue = current.parent
    }
    return result
  }

  function detectFramework(element: Element, components: ComponentInfo[]) {
    const globals = window as unknown as Record<string, unknown>
    const keys = Object.getOwnPropertyNames(element as unknown as Record<string, unknown>)
    if (keys.some((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"))) {
      return globals.__NEXT_DATA__ ? "Next.js / React" : "React"
    }
    if ((element as unknown as Record<string, unknown>).__vueParentComponent) {
      return globals.__NUXT__ ? "Nuxt / Vue" : "Vue"
    }
    if ((element as unknown as Record<string, unknown>).__ngContext__) return "Angular"
    if ((element as unknown as Record<string, unknown>).__svelte_meta__) return "Svelte"
    if (globals.__NEXT_DATA__) return "Next.js / React"
    if (globals.__NUXT__) return "Nuxt / Vue"
    return components.length ? undefined : "HTML"
  }
}

export function inspectorScript(requestID: string) {
  return `(${inspectorMain.toString()})(${JSON.stringify(requestID)});`
}

export function inspectorCall(requestID: string, method: InspectorMethod) {
  return `window[${JSON.stringify(INSPECTOR_GLOBAL)}]?.[${JSON.stringify(method)}](${JSON.stringify(requestID)}) ?? null`
}
