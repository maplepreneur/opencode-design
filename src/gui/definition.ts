import { Plugin } from "@opencode/plugin/gui"

export const definition = Plugin.define({
  i18n: {
    en: {
      "command.start": "Design Mode: Start visual feedback",
      "command.cancel": "Design Mode: Cancel",
      "command.diagnostics": "Design Mode: Browser diagnostics",
      "design.start": "Start visual feedback",
      "design.started": "Click an element in the OpenCode browser",
      "design.started.description": "Hover to inspect, click to select, or press Escape to cancel.",
      "design.cancelled": "Design Mode cancelled",
      "design.submitted": "Visual feedback sent to OpenCode",
      "design.error": "Design Mode",
    },
  },
})
