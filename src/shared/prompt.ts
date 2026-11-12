import type { CapturedSelection } from "./types"

export const SCREENSHOT_MARKER = "[Design Mode screenshot]"

function componentLine(capture: CapturedSelection) {
  if (capture.components.length === 0) return "Not detected"

  return capture.components
    .map((component) => {
      const source = component.source
      const location = source
        ? ` — ${source.fileName}${source.lineNumber ? `:${source.lineNumber}` : ""}${source.columnNumber ? `:${source.columnNumber}` : ""}`
        : ""
      return `${component.name}${location}`
    })
    .join(" → ")
}

export function composePrompt(capture: CapturedSelection, request: string) {
  const sections = [
    `## Request\n${request.trim()}`,
    `## Page\n- URL: ${capture.url}\n- Title: ${capture.title || "(untitled)"}\n- Viewport: ${capture.viewport.width} × ${capture.viewport.height} CSS px at ${capture.viewport.dpr}x DPR\n- Screenshot: ${capture.screenshotWidth} × ${capture.screenshotHeight} px; the selected element is outlined`,
    `## Selected element\n- Label: ${capture.label}\n- Tag: ${capture.tag}\n- CSS selector: ${JSON.stringify(capture.selector)}\n- XPath: ${JSON.stringify(capture.xpath)}\n- Classes: ${capture.classes.length ? capture.classes.join(", ") : "(none)"}\n- Text: ${JSON.stringify(capture.text ?? "")}\n- Framework: ${capture.framework ?? "Not detected"}\n- Component chain: ${componentLine(capture)}\n- Border box: ${JSON.stringify(capture.rect)}`,
    `## Computed styles\n\`\`\`json\n${JSON.stringify(capture.styles, null, 2)}\n\`\`\``,
    `## Trimmed HTML\n\`\`\`json\n${JSON.stringify(capture.html)}\n\`\`\``,
    `## Instructions\nImplement the requested change in the actual source files in the current workspace. Use the screenshot, component metadata, selector, HTML, and styles to identify the correct UI. Follow the project's existing conventions and design tokens; do not merely describe a patch or make a DOM-only preview. If browser tools are available, verify the result after hot reload. Finish with a concise summary of the files changed and verification performed.`,
  ]

  return `${SCREENSHOT_MARKER}\n\n${sections.join("\n\n")}`
}

export function createPromptInput(capture: CapturedSelection, request: string) {
  const extension = capture.screenshotMime === "image/jpeg" ? "jpg" : "png"

  return {
    text: composePrompt(capture, request),
    files: [
      {
        uri: capture.screenshot,
        name: `design-mode-${capture.selectionID}.${extension}`,
        description: `OpenCode browser screenshot with ${capture.label} outlined`,
        mention: {
          start: 0,
          end: SCREENSHOT_MARKER.length,
          text: SCREENSHOT_MARKER,
        },
      },
    ],
    metadata: {
      source: "design-mode",
      url: capture.url,
      selector: capture.selector,
    },
  }
}
