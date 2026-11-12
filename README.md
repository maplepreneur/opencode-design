# Design Mode

Cursor-like **Design Mode for OpenCode Desktop**. Pick an element in OpenCode's built-in browser, describe the change in a popup, and send the request to the current OpenCode session with a highlighted screenshot and source-rich element context.

## What it does

- Hover inspection with a crosshair, element outline, and component label.
- Click selection that does not activate the underlying page.
- Stable CSS selector, XPath, trimmed HTML, text, classes, computed styles, and viewport geometry.
- React and Vue component-chain hints, including development source locations when the framework exposes them.
- A native page screenshot with the selected element outlined, resized for multimodal prompts.
- An OpenCode-native feedback dialog with screenshot preview.
- Direct submission to the same OpenCode session as a real inline image attachment.
- The session uses the model and variant currently selected in OpenCode's composer.
- `Escape` cancellation and cleanup on navigation, tab destruction, or plugin reload.

Design Mode is based on the Agent-mode interaction pioneered in the sibling Arbora project, adapted to OpenCode's GUI plugin, Electron, and session APIs.

## Requirements

- OpenCode Desktop **2.2.7** (the GUI plugin API is experimental).
- The built-in OpenCode Browser panel.
- A model with image input support to use the screenshot directly.

## Install

Install the plugin from GitHub:

```bash
opencode plugin add github:maplepreneur/opencode-design
```

OpenCode Desktop loads GUI plugins from your global `opencode.json(c)`. If you install manually, add the package to the global `plugins` array:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:maplepreneur/opencode-design"]
}
```

## Use

1. Open your app in OpenCode's **Browser** panel and select its tab.
2. Press **Ctrl/Cmd + Shift + D**, choose **Design Mode: Start visual feedback** in the command palette, or click the element-selection icon at the end of the side-panel tabs.
3. Hover and click the element you want to change. Press **Escape** to cancel.
4. Review the highlighted screenshot and element details in the popup.
5. Describe the change and click **Send change** (or press **Enter**; use **Shift + Enter** for a newline).

OpenCode receives the request, screenshot, component hints, selector, HTML, and computed CSS, then edits the real source files in the current workspace.

If Design Mode cannot find a page, open a web page in the Browser panel first. **Design Mode: Browser diagnostics** lists the native views visible to the plugin.

## Develop

```bash
git clone https://github.com/maplepreneur/opencode-design.git
cd opencode-design
npm install
npm run build
```

Add the absolute project path to the `plugins` array in your global `~/.config/opencode/opencode.json(c)`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-design"]
}
```

OpenCode Desktop watches local GUI builds. Run `npm run dev` while developing to rebuild and reload automatically.

A small demo page is included:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory demo
```

Then open `http://127.0.0.1:4173` in OpenCode's Browser panel.

## Verify

```bash
npm run typecheck
npm run test       # prompt and attachment unit tests
npm run test:e2e   # real Chromium element-picking tests
npm run build
```

Or run everything:

```bash
npm run check
```

Chromium tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` to use another Chromium executable.

The plugin has also been smoke-tested in OpenCode Desktop 2.2.7 through native browser selection, screenshot popup display, model switching, inline-image delivery, and a successful vision-model response.

## Architecture

- `src/browser/inspector.ts` — standalone page script, overlay, selection, DOM metadata, and framework hints.
- `src/gui/main.ts` — Electron browser-view discovery, polling, screenshot capture, resizing, and lifecycle.
- `src/gui/window.tsx` — OpenCode commands, side-panel action, feedback popup, model selection, and session delivery.
- `src/gui/contract.ts` — typed Effect Schema IPC between the desktop window and main process.
- `src/shared/prompt.ts` — deterministic prompt and inline-image attachment construction.

Only the selected page is inspected. Design Mode captures a screenshot after selection and sends it to OpenCode only when you submit the feedback.

## Current limits

- Cross-origin iframe contents and closed shadow roots cannot be inspected.
- Exact component source locations depend on development metadata exposed by the app's framework.
- Models without image support can use the textual element context but cannot interpret the screenshot.
- Design Mode sends visual feedback; it does not directly mutate page styles or source files itself.
- OpenCode's GUI plugin API is experimental, so future OpenCode releases may require adapter updates.

## License

MIT
