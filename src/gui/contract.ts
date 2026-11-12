import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

const Rect = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
})

const ComponentSource = Schema.Struct({
  fileName: Schema.String,
  lineNumber: Schema.optionalKey(Schema.Finite),
  columnNumber: Schema.optionalKey(Schema.Finite),
})

const Component = Schema.Struct({
  name: Schema.String,
  source: Schema.optionalKey(ComponentSource),
})

const Selection = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  label: Schema.String,
  tag: Schema.String,
  selector: Schema.String,
  xpath: Schema.String,
  text: Schema.optionalKey(Schema.String),
  html: Schema.String,
  classes: Schema.Array(Schema.String),
  styles: Schema.Record(Schema.String, Schema.String),
  rect: Rect,
  viewport: Schema.Struct({ width: Schema.Finite, height: Schema.Finite, dpr: Schema.Finite }),
  framework: Schema.optionalKey(Schema.String),
  components: Schema.Array(Component),
})

const Capture = Schema.Struct({
  ...Selection.fields,
  selectionID: Schema.String,
  screenshot: Schema.String,
  screenshotMime: Schema.Literals(["image/png", "image/jpeg"]),
  screenshotWidth: Schema.Finite,
  screenshotHeight: Schema.Finite,
})

const PageDiagnostic = Schema.Struct({
  id: Schema.Finite,
  url: Schema.String,
  title: Schema.String,
  type: Schema.String,
  visible: Schema.Boolean,
  focused: Schema.Boolean,
  width: Schema.Finite,
  height: Schema.Finite,
})

export const DesignModeIpc = Ipc.define({
  id: "design-mode.feedback",
  state: Schema.Struct({
    active: Schema.Boolean,
    inspecting: Schema.Boolean,
    requestID: Schema.optionalKey(Schema.String),
  }),
  methods: {
    start: { output: Schema.Struct({ requestID: Schema.String }) },
    cancel: {},
    finish: { input: Schema.Struct({ requestID: Schema.String }) },
    diagnose: { output: Schema.Struct({ pages: Schema.Array(PageDiagnostic) }) },
  },
  events: {
    selected: Capture,
    cancelled: Schema.Struct({ requestID: Schema.String }),
    error: Schema.Struct({ requestID: Schema.String, message: Schema.String }),
  },
})
