import type { ShortcutAction } from '@shared/settings/shared/shortcuts'
import type { WorkspacePaneId } from './workspace_tab'

export const AREA_IDS = [
  'projects',
  'collections',
  'auth',
  'page_tabs',
  'settings',
  'results'
] as const

export type AreaId = (typeof AREA_IDS)[number]

export type AreaFocusHost = {
  splitEnabled: boolean
  focusedPane: WorkspacePaneId
  setFocusedPane: (pane: WorkspacePaneId) => void
  showFirestore: () => void
  showAuth: () => void
  openPalette: () => void
  closeActiveTab: () => void
  hasPageTabs: (pane: WorkspacePaneId) => boolean
}

const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'

let host: AreaFocusHost | null = null

export function registerAreaFocusHost(next: AreaFocusHost | null): void {
  host = next
}

export function isOverlayOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
}

function areaSelector(area: AreaId, pane?: WorkspacePaneId): string {
  if (pane && (area === 'page_tabs' || area === 'settings' || area === 'results')) {
    return `[data-area="${area}"][data-pane="${pane}"]`
  }

  return `[data-area="${area}"]`
}

function firstFocusable(root: Element): HTMLElement | null {
  if (!(root instanceof HTMLElement)) {
    return null
  }

  const current = root.querySelector('[data-tree-active="true"]')
  if (current instanceof HTMLElement) {
    return current
  }

  if (root.matches(FOCUSABLE)) {
    return root
  }

  const found = root.querySelector(FOCUSABLE)
  return found instanceof HTMLElement ? found : root
}

export function focusNamedArea(area: AreaId, pane?: WorkspacePaneId): boolean {
  const root = document.querySelector(areaSelector(area, pane))
  if (!root) {
    return false
  }

  const target = firstFocusable(root)
  if (!target) {
    return false
  }

  if (root instanceof HTMLElement && root.tabIndex < 0 && target === root) {
    root.tabIndex = -1
  }

  target.focus()
  return document.activeElement === target || root.contains(document.activeElement)
}

export function readCurrentArea(): AreaId | null {
  const active = document.activeElement
  if (!(active instanceof Element)) {
    return null
  }

  const node = active.closest('[data-area]')
  const value = node?.getAttribute('data-area')
  return AREA_IDS.includes(value as AreaId) ? (value as AreaId) : null
}

function isVisible(element: HTMLElement): boolean {
  if (element.closest('[hidden], [aria-hidden="true"]')) {
    return false
  }

  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false
  }

  return element.getClientRects().length > 0
}

function areaRoots(area: AreaId): Element[] {
  return [...document.querySelectorAll(`[data-area="${area}"]`)]
}

function collectFocusables(roots: Element[]): HTMLElement[] {
  const seen = new Set<HTMLElement>()
  const list: HTMLElement[] = []

  for (const root of roots) {
    if (!(root instanceof HTMLElement)) {
      continue
    }

    for (const node of root.querySelectorAll(FOCUSABLE)) {
      if (!(node instanceof HTMLElement) || seen.has(node) || node.tabIndex < 0 || !isVisible(node)) {
        continue
      }

      seen.add(node)
      list.push(node)
    }
  }

  list.sort((left, right) => {
    const position = left.compareDocumentPosition(right)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1
    }
    return 0
  })

  return list
}

function syncFocusedPane(element: HTMLElement | undefined): void {
  const pane = element?.closest('[data-pane]')?.getAttribute('data-pane')
  if (pane === 'primary' || pane === 'secondary') {
    host?.setFocusedPane(pane)
  }
}

function moveTabInRoots(roots: Element[], reverse: boolean): boolean {
  const items = collectFocusables(roots)
  if (items.length === 0) {
    return true
  }

  const active = document.activeElement
  let index = items.findIndex(
    (item) => item === active || (active instanceof Node && item.contains(active))
  )

  if (index === -1) {
    const target = items[reverse ? items.length - 1 : 0]
    target?.focus()
    syncFocusedPane(target)
    return true
  }

  const next = reverse
    ? (index - 1 + items.length) % items.length
    : (index + 1) % items.length
  const target = items[next]
  target?.focus()
  syncFocusedPane(target)
  return true
}

/** エリア内だけ Tab 一周。エリア外にいるときは false（ブラウザに任せる）。 */
export function moveTabInCurrentArea(reverse: boolean): boolean {
  const active = document.activeElement
  if (!(active instanceof Element)) {
    return false
  }

  const areaNode = active.closest('[data-area]')
  const areaName = areaNode?.getAttribute('data-area')

  if (areaName === 'menu') {
    const menu = document.querySelector('.app-menu-bar')
    return menu ? moveTabInRoots([menu], reverse) : true
  }

  if (!AREA_IDS.includes(areaName as AreaId)) {
    return false
  }

  return moveTabInRoots(areaRoots(areaName as AreaId), reverse)
}

export function moveTabInOverlay(reverse: boolean): boolean {
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
  if (!dialog) {
    return false
  }

  return moveTabInRoots([dialog], reverse)
}

function workPane(): WorkspacePaneId {
  return host?.focusedPane ?? 'primary'
}

function afterPaint(run: () => void): void {
  window.setTimeout(run, 0)
}

function landPageTabs(pane: WorkspacePaneId): boolean {
  if (!host?.hasPageTabs(pane)) {
    return false
  }

  host.showFirestore()
  host.setFocusedPane(pane)
  afterPaint(() => {
    focusNamedArea('page_tabs', pane)
  })
  return true
}

function landWorkArea(area: 'settings' | 'results'): boolean {
  if (!host) {
    return false
  }

  const pane = workPane()
  if (!document.querySelector(areaSelector(area, pane))) {
    return false
  }

  afterPaint(() => {
    focusNamedArea(area, pane)
  })
  return true
}

function landLeft(area: 'projects' | 'collections' | 'auth'): boolean {
  if (area === 'auth') {
    host?.showAuth()
  } else {
    host?.showFirestore()
  }

  afterPaint(() => {
    focusNamedArea(area)
  })
  return Boolean(document.querySelector(areaSelector(area)))
}

function tryLand(area: AreaId): boolean {
  switch (area) {
    case 'projects':
    case 'collections':
    case 'auth':
      return landLeft(area)
    case 'page_tabs':
      return landPageTabs(workPane())
    case 'settings':
    case 'results':
      return landWorkArea(area)
    default:
      return false
  }
}

function cycleArea(step: 1 | -1): boolean {
  const current = readCurrentArea()
  const start = current ? AREA_IDS.indexOf(current) : step === 1 ? -1 : 0

  for (let offset = 1; offset <= AREA_IDS.length; offset += 1) {
    const index = (start + step * offset + AREA_IDS.length) % AREA_IDS.length
    const area = AREA_IDS[index]
    if (tryLand(area)) {
      return true
    }
  }

  return false
}

export function focusMenu(): boolean {
  const trigger = document.querySelector('.app-menu-bar__trigger')
  if (!(trigger instanceof HTMLButtonElement)) {
    return false
  }

  trigger.focus()
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    trigger.click()
  }

  return true
}

export function handleShortcutAction(action: ShortcutAction): boolean {
  switch (action) {
    case 'menu':
      return focusMenu()
    case 'projects':
      return landLeft('projects')
    case 'collections':
      return landLeft('collections')
    case 'auth':
      return landLeft('auth')
    case 'page_tabs_1':
      return landPageTabs('primary')
    case 'page_tabs_2':
      return landPageTabs(host?.splitEnabled ? 'secondary' : 'primary')
    case 'settings':
      return landWorkArea('settings')
    case 'results':
      return landWorkArea('results')
    case 'next_area':
      return cycleArea(1)
    case 'prev_area':
      return cycleArea(-1)
    case 'palette':
      host?.openPalette()
      return Boolean(host)
    case 'close_tab':
      host?.closeActiveTab()
      return Boolean(host)
    default:
      return false
  }
}
