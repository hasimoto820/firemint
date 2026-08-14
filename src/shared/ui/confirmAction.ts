export async function confirmAction(
  message: string,
  labels?: { confirmLabel?: string; cancelLabel?: string }
): Promise<boolean> {
  return window.api.window.confirm({
    message,
    confirmLabel: labels?.confirmLabel,
    cancelLabel: labels?.cancelLabel
  })
}
