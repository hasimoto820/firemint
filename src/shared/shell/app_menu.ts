export type AppMenuItem = {
  type: 'item'
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  /** true / 1 = 一段、2 = 二段 */
  indent?: boolean | 1 | 2
  onClick?: () => void
}

export type AppMenuSeparator = {
  type: 'separator'
}

export type AppMenuHeader = {
  type: 'header'
  label: string
  indent?: boolean | 1 | 2
}

export type AppMenuEntry = AppMenuItem | AppMenuSeparator | AppMenuHeader

export type AppMenuSection = {
  id: string
  label: string
  items: AppMenuEntry[]
}
