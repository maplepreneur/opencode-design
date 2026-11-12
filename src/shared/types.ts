export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ComponentSource {
  fileName: string
  lineNumber?: number
  columnNumber?: number
}

export interface ComponentInfo {
  name: string
  source?: ComponentSource
}

export interface ElementSelection {
  url: string
  title: string
  label: string
  tag: string
  selector: string
  xpath: string
  text?: string
  html: string
  classes: readonly string[]
  styles: Readonly<Record<string, string>>
  rect: Rect
  viewport: {
    width: number
    height: number
    dpr: number
  }
  framework?: string
  components: readonly ComponentInfo[]
}

export interface CapturedSelection extends ElementSelection {
  selectionID: string
  screenshot: string
  screenshotMime: "image/png" | "image/jpeg"
  screenshotWidth: number
  screenshotHeight: number
}

export interface PageDiagnostic {
  id: number
  url: string
  title: string
  type: string
  visible: boolean
  focused: boolean
  width: number
  height: number
}
