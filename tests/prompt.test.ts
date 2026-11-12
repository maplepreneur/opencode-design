import { describe, expect, it } from "vitest"
import { composePrompt, createPromptInput, SCREENSHOT_MARKER } from "../src/shared/prompt"
import { capture } from "./fixture"

describe("visual feedback prompt", () => {
  it("includes the request and source-rich element context", () => {
    const text = composePrompt(capture, "Make it match the primary action.")

    expect(text).toContain("Make it match the primary action.")
    expect(text).toContain("http://localhost:3000/settings")
    expect(text).toContain('"#save"')
    expect(text).toContain("SaveButton — /src/SaveButton.tsx:42:8")
    expect(text).toContain('"paddingLeft": "16px"')
    expect(text).toContain("actual source files")
    expect(text).toContain("verify the result")
    expect(text).not.toContain(capture.screenshot)
  })

  it("attaches a real inline image with a matching mention", () => {
    const input = createPromptInput(capture, "Use more padding")

    expect(input.text.startsWith(SCREENSHOT_MARKER)).toBe(true)
    expect(input.files).toHaveLength(1)
    const [file] = input.files
    expect(file?.uri).toBe(capture.screenshot)
    expect(file?.name).toBe("design-mode-selection-123.png")
    expect(file?.mention).toEqual({ start: 0, end: SCREENSHOT_MARKER.length, text: SCREENSHOT_MARKER })
    expect(input.text.slice(file?.mention.start, file?.mention.end)).toBe(SCREENSHOT_MARKER)
    expect(input.metadata).toEqual({ source: "design-mode", url: capture.url, selector: "#save" })
  })

  it("uses a jpg filename when capture falls back to JPEG", () => {
    const input = createPromptInput({ ...capture, screenshotMime: "image/jpeg" }, "Change this")
    expect(input.files[0]?.name).toBe("design-mode-selection-123.jpg")
  })
})
