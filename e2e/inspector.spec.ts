import { expect, test, type Page } from "@playwright/test"
import { inspectorCall, inspectorScript, INSPECTOR_GLOBAL } from "../src/browser/inspector"

const fixture = `<!doctype html>
<html>
  <head><title>Design Mode fixture</title></head>
  <body>
    <main style="padding: 24px; font-family: sans-serif">
      <h1>Account settings</h1>
      <button id="save" class="primary" style="padding: 12px 20px" onclick="window.saveClicks = (window.saveClicks || 0) + 1">Save changes</button>
      <button data-testid="submit-feedback">Send feedback</button>
      <div><span><strong>Nested element</strong></span></div>
    </main>
  </body>
</html>`

async function install(page: Page, id: string) {
  await page.setContent(fixture)
  await page.evaluate(inspectorScript(id))
}

async function poll(page: Page, id: string) {
  return page.evaluate(inspectorCall(id, "poll")) as Promise<{
    type: string
    selection?: Record<string, unknown>
  } | null>
}

test("selects an element without activating the page and collects useful metadata", async ({ page }) => {
  await install(page, "pick")
  await page.locator("#save").click()

  const result = await poll(page, "pick")
  expect(result?.type).toBe("selected")
  const selection = result?.selection as Record<string, any>
  expect(selection.label).toBe("button#save")
  expect(selection.selector).toBe("#save")
  expect(selection.xpath).toBe("//*[@id='save']")
  expect(selection.text).toBe("Save changes")
  expect(selection.framework).toBe("HTML")
  expect(selection.styles.paddingLeft).toBe("20px")
  expect(selection.rect.width).toBeGreaterThan(0)
  expect(selection.viewport.width).toBe(1280)
  expect(selection.html).toContain('id="save"')
  expect(selection.html).not.toContain("onclick")
  expect(await page.evaluate("window.saveClicks ?? 0")).toBe(0)

  expect(await page.evaluate(inspectorCall("pick", "prepareCapture"))).toBe(true)
  const screenshot = await page.screenshot()
  expect(screenshot.byteLength).toBeGreaterThan(1000)
  expect(await page.evaluate(inspectorCall("pick", "finishCapture"))).toBe(true)
  expect(await page.locator("[data-design-mode-inspector='pick']").evaluate((node) => node.style.display)).toBe("none")

  expect(await page.evaluate(inspectorCall("pick", "cancel"))).toBe(true)
  await expect(page.locator("[data-design-mode-inspector='pick']")).toHaveCount(0)
  await page.locator("#save").click()
  expect(await page.evaluate("window.saveClicks ?? 0")).toBe(1)
})

test("uses a unique test id selector", async ({ page }) => {
  await install(page, "testid")
  await page.locator("[data-testid='submit-feedback']").click()
  const result = await poll(page, "testid")
  expect(result?.selection?.selector).toBe('button[data-testid="submit-feedback"]')
})

test("resolves React component and exact source hints", async ({ page }) => {
  await install(page, "react")
  await page.evaluate(() => {
    function SaveButton() {}
    const button = document.querySelector("#save")!
    Object.defineProperty(button, "__reactFiber$test", {
      value: {
        type: SaveButton,
        _debugSource: { fileName: "/src/SaveButton.tsx", lineNumber: 42, columnNumber: 8 },
        return: { type: { displayName: "SettingsForm" }, return: null },
      },
    })
  })
  await page.locator("#save").click()
  const result = await poll(page, "react")
  const selection = result?.selection as Record<string, any>
  expect(selection.framework).toBe("React")
  expect(selection.components).toEqual([
    { name: "SaveButton", source: { fileName: "/src/SaveButton.tsx", lineNumber: 42, columnNumber: 8 } },
    { name: "SettingsForm" },
  ])
})

test("Escape cancels and removes the inspector cleanly", async ({ page }) => {
  await install(page, "escape")
  await page.keyboard.press("Escape")
  expect((await poll(page, "escape"))?.type).toBe("cancelled")
  expect(await page.evaluate(inspectorCall("escape", "cancel"))).toBe(true)
  await expect(page.locator("[data-design-mode-inspector='escape']")).toHaveCount(0)
  expect(await page.evaluate(inspectorCall("escape", "poll"))).toBeNull()
  expect(
    await page.evaluate((key) => Object.keys(window).includes(key), INSPECTOR_GLOBAL),
  ).toBe(false)
})
