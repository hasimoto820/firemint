export type ConfirmActionOptions = {
  confirmLabel?: string
  cancelLabel?: string
  detail?: string
  checkboxLabel?: string
  checkboxChecked?: boolean
}

export async function confirmAction(
  message: string,
  options?: ConfirmActionOptions
): Promise<boolean> {
  const result = await window.api.window.confirm({
    message,
    confirmLabel: options?.confirmLabel,
    cancelLabel: options?.cancelLabel,
    detail: options?.detail
  })

  return result.confirmed
}

export async function confirmActionWithCheckbox(
  message: string,
  options: ConfirmActionOptions & { checkboxLabel: string }
): Promise<{ confirmed: boolean; checkboxChecked: boolean }> {
  return window.api.window.confirm({
    message,
    confirmLabel: options.confirmLabel,
    cancelLabel: options.cancelLabel,
    detail: options.detail,
    checkboxLabel: options.checkboxLabel,
    checkboxChecked: options.checkboxChecked ?? false
  })
}
