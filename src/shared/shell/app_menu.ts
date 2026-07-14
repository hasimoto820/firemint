export type AppMenuItem = {
  type: 'item'
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  indent?: boolean
  onClick?: () => void
}

export type AppMenuSeparator = {
  type: 'separator'
}

export type AppMenuHeader = {
  type: 'header'
  label: string
}

export type AppMenuEntry = AppMenuItem | AppMenuSeparator | AppMenuHeader

export type AppMenuSection = {
  id: string
  label: string
  items: AppMenuEntry[]
}
