import type { CapturedSelection } from "../src/shared/types"

export const capture: CapturedSelection = {
  selectionID: "selection-123",
  url: "http://localhost:3000/settings",
  title: "Settings — Example",
  label: "button#save",
  tag: "button",
  selector: "#save",
  xpath: "//*[@id='save']",
  text: "Save changes",
  html: '<button id="save" class="primary">Save changes</button>',
  classes: ["primary"],
  styles: { display: "inline-flex", color: "rgb(255, 255, 255)", paddingLeft: "16px" },
  rect: { x: 20, y: 40, width: 120, height: 36 },
  viewport: { width: 1280, height: 720, dpr: 2 },
  framework: "React",
  components: [
    { name: "SaveButton", source: { fileName: "/src/SaveButton.tsx", lineNumber: 42, columnNumber: 8 } },
    { name: "SettingsForm" },
  ],
  screenshot: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  screenshotMime: "image/png",
  screenshotWidth: 1280,
  screenshotHeight: 720,
}
