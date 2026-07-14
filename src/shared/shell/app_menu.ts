export type AppMenuItem = {
  type: 'item'
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  onClick?: () => void
}

export type AppMenuSeparator = {
  type: 'separator'
}

export type AppMenuEntry = AppMenuItem | AppMenuSeparator

export type AppMenuSection = {
  id: string
  label: string
  items: AppMenuEntry[]
}
