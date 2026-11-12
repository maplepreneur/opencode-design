import { createSignal, onCleanup, Show } from "solid-js"
import {
  Command,
  Slot,
  Style,
  usePlugin,
  type MountedSession,
  type Plugin,
} from "@opencode/plugin/gui"
import { createPromptInput } from "../shared/prompt"
import type { CapturedSelection } from "../shared/types"
import { DesignModeIpc } from "./contract"
import type { definition } from "./definition"

const styles = `
  .design-mode-feedback { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .design-mode-preview {
    display: block; width: 100%; max-height: 170px; object-fit: contain;
    border: 1px solid var(--border-base, rgba(127,127,127,.35)); border-radius: 8px;
    background: var(--background-strong, rgba(127,127,127,.08));
  }
  .design-mode-target { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .design-mode-target-label { font-size: 13px; font-weight: 600; color: var(--text-strong, currentColor); }
  .design-mode-target-detail {
    font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--text-weak, currentColor); overflow-wrap: anywhere;
  }
  .design-mode-request {
    box-sizing: border-box; width: 100%; min-height: 88px; resize: vertical;
    border: 1px solid var(--border-base, rgba(127,127,127,.45)); border-radius: 8px;
    padding: 10px 12px; color: var(--text-base, currentColor);
    background: var(--background-base, transparent); font: 13px/1.55 inherit;
  }
  .design-mode-request:focus { outline: 2px solid var(--border-active, #7c5cff); outline-offset: -1px; }
  .design-mode-error { color: var(--text-error, #ef4444); font-size: 12px; line-height: 1.5; }
`

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

function FeedbackDialog(props: {
  session: MountedSession
  capture: CapturedSelection
  close: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const ipc = ctx.main(DesignModeIpc)
  const [request, setRequest] = createSignal("")
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  let finished = false

  onCleanup(() => {
    if (finished) return
    finished = true
    void ipc.finish({ requestID: props.capture.selectionID }, { signal: ctx.signal }).catch(() => undefined)
  })

  async function submit() {
    const text = request().trim()
    if (!text || pending()) return
    setPending(true)
    setError(undefined)
    try {
      const input = createPromptInput(props.capture, text)
      const model = ctx.screen.current()?.composer.model()
      if (model) {
        await props.session.server.client.session.switchModel({
          sessionID: props.session.id,
          model: {
            providerID: model.providerID,
            id: model.modelID,
            ...(model.variant ? { variant: model.variant } : {}),
          },
        })
      }
      await props.session.server.client.session.prompt({
        sessionID: props.session.id,
        ...input,
      })
      finished = true
      void ipc.finish({ requestID: props.capture.selectionID }, { signal: ctx.signal }).catch(() => undefined)
      props.close()
      ctx.toast.show({
        variant: "success",
        title: ctx.t("design.submitted"),
        description: "The screenshot and element context are attached to the current session.",
      })
    } catch (cause) {
      setError(message(cause))
      setPending(false)
    }
  }

  return (
    <ctx.ui.Dialog
      title="Design feedback"
      size="large"
      footer={
        <>
          <ctx.ui.Button variant="ghost" onClick={props.close} disabled={pending()}>
            Cancel
          </ctx.ui.Button>
          <ctx.ui.Button variant="contrast" onClick={() => void submit()} busy={pending()} disabled={!request().trim()}>
            Send change
          </ctx.ui.Button>
        </>
      }
    >
      <div class="design-mode-feedback">
        <img
          class="design-mode-preview"
          src={props.capture.screenshot}
          alt={`Page screenshot with ${props.capture.label} outlined`}
        />
        <div class="design-mode-target">
          <div class="design-mode-target-label">
            {props.capture.components[0]?.name
              ? `${props.capture.components[0]!.name} · ${props.capture.label}`
              : props.capture.label}
          </div>
          <div class="design-mode-target-detail">{props.capture.selector}</div>
          <div class="design-mode-target-detail">{props.capture.url}</div>
        </div>
        <textarea
          class="design-mode-request"
          aria-label="Describe the change"
          placeholder="What should change? For example: Make this button primary and align it with the header."
          value={request()}
          onInput={(event) => setRequest(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
          autofocus
          disabled={pending()}
        />
        <Show when={error()}>{(value) => <div class="design-mode-error">{value()}</div>}</Show>
      </div>
    </ctx.ui.Dialog>
  )
}

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (ctx.app.platform !== "desktop") return
  const ipc = ctx.main(DesignModeIpc)
  const requests = new Map<string, MountedSession>()
  const active = () => ipc.state()?.active ?? false

  ctx.add(Style, styles)

  async function begin(session: MountedSession) {
    try {
      const result = await ipc.start({ signal: ctx.signal })
      requests.set(result.requestID, session)
      ctx.toast.show({
        title: ctx.t("design.started"),
        description: ctx.t("design.started.description"),
      })
    } catch (cause) {
      ctx.toast.show({ variant: "error", title: ctx.t("design.error"), description: message(cause) })
    }
  }

  async function cancel() {
    const requestID = ipc.state()?.requestID
    await ipc.cancel({ signal: ctx.signal }).catch(() => undefined)
    if (requestID) requests.delete(requestID)
  }

  ctx.add(Command, (): Command | undefined => {
    const session = ctx.sessions.current()
    if (!session) return undefined
    return {
      id: "start",
      title: ctx.t("command.start"),
      description: "Select a browser element and send visual feedback with a screenshot",
      keywords: "cursor design inspect visual feedback screenshot browser element",
      group: "View",
      bind: "mod+shift+d",
      editable: true,
      enabled: !active(),
      run: () => begin(session),
    }
  })

  ctx.add(Command, (): Command => ({
    id: "cancel",
    title: ctx.t("command.cancel"),
    group: "View",
    enabled: active(),
    run: cancel,
  }))

  ctx.add(Command, (): Command => ({
    id: "diagnostics",
    title: ctx.t("command.diagnostics"),
    group: "View",
    run: async () => {
      const result = await ipc.diagnose({ signal: ctx.signal })
      await ctx.dialogs.alert({
        title: "Design Mode browser diagnostics",
        description: result.pages.length
          ? result.pages
              .map(
                (page) =>
                  `${page.visible ? "Visible" : "Hidden"} · ${page.focused ? "Focused · " : ""}${page.title || page.url}\n${page.url}`,
              )
              .join("\n\n")
          : "No native browser views found. Open a page in the Browser panel first.",
      })
    },
  }))

  ctx.add(Slot, {
    at: "session.panel.end",
    render: (input) => (
      <Show
        when={!active()}
        fallback={
          <ctx.ui.Tooltip value="Cancel design mode">
            <ctx.ui.IconButton icon="circle-x" label="Cancel design mode" onClick={() => void cancel()} />
          </ctx.ui.Tooltip>
        }
      >
        <ctx.ui.Tooltip value="Design mode · Ctrl/Cmd+Shift+D">
          <ctx.ui.IconButton
            icon="select-element"
            label={ctx.t("design.start")}
            onClick={() => void begin(input.session)}
          />
        </ctx.ui.Tooltip>
      </Show>
    ),
  })

  ipc.on("selected", (capture) => {
    const session = requests.get(capture.selectionID) ?? ctx.sessions.current()
    requests.delete(capture.selectionID)
    if (!session) {
      void ipc.finish({ requestID: capture.selectionID }, { signal: ctx.signal })
      ctx.toast.show({
        variant: "error",
        title: ctx.t("design.error"),
        description: "The session that started design mode is no longer available.",
      })
      return
    }
    ctx.dialogs.open((dialog) => <FeedbackDialog session={session} capture={capture} close={dialog.close} />)
  })

  ipc.on("cancelled", ({ requestID }) => {
    requests.delete(requestID)
    ctx.toast.show({ title: ctx.t("design.cancelled") })
  })

  ipc.on("error", ({ requestID, message: detail }) => {
    requests.delete(requestID)
    ctx.toast.show({ variant: "error", title: ctx.t("design.error"), description: detail })
  })

  onCleanup(() => requests.clear())
}
