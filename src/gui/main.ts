import { randomUUID } from "node:crypto"
import { WebContentsView, type BrowserWindow, type WebContents } from "electron"
import type { Plugin } from "@opencode/plugin/gui"
import { inspectorCall, inspectorScript } from "../browser/inspector"
import type { CapturedSelection, ElementSelection, PageDiagnostic } from "../shared/types"
import { DesignModeIpc } from "./contract"

type ActiveInspection = {
  requestID: string
  contents: WebContents
  inspecting: boolean
  polling: boolean
  timer?: ReturnType<typeof setTimeout>
  onNavigate: (event: Electron.Event<{ isMainFrame: boolean; isSameDocument: boolean }>) => void
  onDestroyed: () => void
}

type Page = {
  view: WebContentsView
  contents: WebContents
  visible: boolean
  focused: boolean
}

function pages(window: BrowserWindow): Page[] {
  return window.contentView.children
    .filter((child): child is WebContentsView => child instanceof WebContentsView)
    .map((view) => ({
      view,
      contents: view.webContents,
      visible: view.getVisible(),
      focused: view.webContents.isFocused(),
    }))
}

function inspectable(page: Page) {
  if (page.contents.isDestroyed()) return false
  const url = page.contents.getURL()
  return /^(https?|file):/.test(url)
}

function currentPage(window: BrowserWindow | undefined) {
  if (!window || window.isDestroyed()) return undefined
  const visible = pages(window).filter((page) => {
    const bounds = page.view.getBounds()
    return page.visible && bounds.width > 0 && bounds.height > 0 && inspectable(page)
  })
  return visible.find((page) => page.focused) ?? visible.at(-1)
}

function diagnostics(window: BrowserWindow | undefined): PageDiagnostic[] {
  if (!window || window.isDestroyed()) return []
  return pages(window).map((page) => {
    const bounds = page.view.getBounds()
    return {
      id: page.contents.id,
      url: page.contents.getURL(),
      title: page.contents.getTitle(),
      type: page.contents.getType(),
      visible: page.visible,
      focused: page.focused,
      width: bounds.width,
      height: bounds.height,
    }
  })
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

export const main: Plugin.MainSetup = (ctx) => {
  const inspections = new Map<number, ActiveInspection>()

  function changed(windowID: number) {
    provider.changed(windowID)
  }

  async function stop(windowID: number, requestID?: string) {
    const active = inspections.get(windowID)
    if (!active || (requestID && active.requestID !== requestID)) return
    inspections.delete(windowID)
    clearTimeout(active.timer)
    active.contents.off("did-start-navigation", active.onNavigate)
    active.contents.off("destroyed", active.onDestroyed)
    if (!active.contents.isDestroyed()) {
      await active.contents
        .executeJavaScript(inspectorCall(active.requestID, "cancel"), true)
        .catch(() => undefined)
    }
    changed(windowID)
  }

  async function fail(windowID: number, active: ActiveInspection, cause: unknown) {
    const message = errorMessage(cause)
    ctx.log.write("error", "Design Mode inspection failed", { requestID: active.requestID, message })
    provider.emit("error", { requestID: active.requestID, message }, windowID)
    await stop(windowID, active.requestID)
  }

  async function capture(active: ActiveInspection, selection: ElementSelection): Promise<CapturedSelection> {
    const prepared = (await active.contents.executeJavaScript(
      inspectorCall(active.requestID, "prepareCapture"),
      true,
    )) as boolean | null
    if (!prepared) throw new Error("The selected element is no longer available. Please pick it again.")

    let image = await active.contents.capturePage()
    await active.contents
      .executeJavaScript(inspectorCall(active.requestID, "finishCapture"), true)
      .catch(() => undefined)

    const original = image.getSize()
    const longEdge = Math.max(original.width, original.height)
    if (longEdge > 1568) {
      const scale = 1568 / longEdge
      image = image.resize({
        width: Math.max(1, Math.round(original.width * scale)),
        height: Math.max(1, Math.round(original.height * scale)),
      })
    }

    const size = image.getSize()
    let bytes = image.toPNG()
    let mime: CapturedSelection["screenshotMime"] = "image/png"
    if (bytes.byteLength > 1_500_000) {
      bytes = image.toJPEG(85)
      mime = "image/jpeg"
    }

    return {
      ...selection,
      selectionID: active.requestID,
      screenshot: `data:${mime};base64,${bytes.toString("base64")}`,
      screenshotMime: mime,
      screenshotWidth: size.width,
      screenshotHeight: size.height,
    }
  }

  async function poll(windowID: number, requestID: string) {
    const active = inspections.get(windowID)
    if (!active || active.requestID !== requestID || active.polling || !active.inspecting) return
    active.polling = true
    try {
      const result = (await active.contents.executeJavaScript(inspectorCall(requestID, "poll"), true)) as
        | { type: "active" | "cancelled" }
        | { type: "selected"; selection: ElementSelection }
        | null

      if (result?.type === "cancelled") {
        provider.emit("cancelled", { requestID }, windowID)
        await stop(windowID, requestID)
        return
      }

      if (result?.type === "selected") {
        active.inspecting = false
        changed(windowID)
        const selection = await capture(active, result.selection)
        if (inspections.get(windowID) !== active) return
        ctx.log.write("info", "Design Mode captured an element", {
          requestID,
          url: selection.url,
          selector: selection.selector,
        })
        provider.emit("selected", selection, windowID)
        return
      }
    } catch (cause) {
      await fail(windowID, active, cause)
      return
    } finally {
      active.polling = false
    }

    const current = inspections.get(windowID)
    if (current === active && active.inspecting) {
      active.timer = setTimeout(() => void poll(windowID, requestID), 75)
    }
  }

  const provider = ctx.provide(DesignModeIpc, {
    state(windowID) {
      const active = typeof windowID === "number" ? inspections.get(windowID) : undefined
      return {
        active: !!active,
        inspecting: active?.inspecting ?? false,
        ...(active ? { requestID: active.requestID } : {}),
      }
    },
    async start(_input, caller) {
      await stop(caller.window)
      const window = ctx.windows.get(caller.window)
      const page = currentPage(window)
      if (!page) {
        throw new Error(
          "Open a web page in OpenCode's Browser panel and select its tab, then start Design Mode again.",
        )
      }

      const requestID = randomUUID()
      await page.contents.executeJavaScript(inspectorScript(requestID), true)
      const active: ActiveInspection = {
        requestID,
        contents: page.contents,
        inspecting: true,
        polling: false,
        onNavigate: (event) => {
          if (!event.isMainFrame || event.isSameDocument) return
          provider.emit("cancelled", { requestID }, caller.window)
          void stop(caller.window, requestID)
        },
        onDestroyed: () => {
          provider.emit("cancelled", { requestID }, caller.window)
          void stop(caller.window, requestID)
        },
      }
      inspections.set(caller.window, active)
      page.contents.on("did-start-navigation", active.onNavigate)
      page.contents.once("destroyed", active.onDestroyed)
      changed(caller.window)
      ctx.log.write("info", "Design Mode inspection started", { requestID, url: page.contents.getURL() })
      void poll(caller.window, requestID)
      return { requestID }
    },
    async cancel(_input, caller) {
      await stop(caller.window)
    },
    async finish(input, caller) {
      await stop(caller.window, input.requestID)
    },
    diagnose(_input, caller) {
      return { pages: diagnostics(ctx.windows.get(caller.window)) }
    },
  })

  ctx.onCleanup(async () => {
    await Promise.all(Array.from(inspections.keys(), (windowID) => stop(windowID)))
  })
}
