import type { WorkspacePaneId, WorkspaceTab } from './workspace_tab'

export const TAB_GROUP_COLORS = [
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'grey'
] as const

export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number]

export type WorkspaceTabGroup = {
  id: string
  title: string
  color: TabGroupColor
  collapsed: boolean
  pane: WorkspacePaneId
}

export type TabDragSource =
  | { type: 'tab'; tabId: string }
  | { type: 'group'; groupId: string }

export type TabDropDest =
  | { type: 'tab'; tabId: string; place: 'before' | 'after' }
  | { type: 'group'; groupId: string; place: 'before' | 'after' | 'into' }

export type TabBarItem =
  | { type: 'tab'; tab: WorkspaceTab }
  | { type: 'group'; group: WorkspaceTabGroup; tabs: WorkspaceTab[] }

let groupSeq = 0

export function createTabGroupId(): string {
  groupSeq += 1
  return `tab-group-${Date.now()}-${groupSeq}`
}

export function createTabGroup(
  pane: WorkspacePaneId,
  color: TabGroupColor,
  title = ''
): WorkspaceTabGroup {
  return {
    id: createTabGroupId(),
    title,
    color,
    collapsed: false,
    pane
  }
}

/** 現存する「プレフィックス＋番号」の最大＋1。欠番は埋めない。 */
export function nextGroupSerialTitle(
  groups: WorkspaceTabGroup[],
  prefix: string
): string {
  const prefixes = Array.from(new Set([prefix, 'グループ'].filter(Boolean)))
  let max = 0

  for (const group of groups) {
    const title = group.title.trim()
    for (const item of prefixes) {
      if (!title.startsWith(item)) {
        continue
      }
      const rest = title.slice(item.length)
      if (/^[1-9]\d*$/.test(rest)) {
        max = Math.max(max, Number(rest))
      }
    }
  }

  return `${prefix}${max + 1}`
}

export function nextTabGroupColor(existing: WorkspaceTabGroup[]): TabGroupColor {
  const used = new Set(existing.map((group) => group.color))
  const unused = TAB_GROUP_COLORS.find((color) => !used.has(color))
  if (unused) {
    return unused
  }

  return TAB_GROUP_COLORS[existing.length % TAB_GROUP_COLORS.length]
}

export function pruneEmptyGroups(
  groups: WorkspaceTabGroup[],
  tabs: WorkspaceTab[]
): WorkspaceTabGroup[] {
  const used = new Set(
    tabs.map((tab) => tab.groupId).filter((groupId): groupId is string => Boolean(groupId))
  )
  const next = groups.filter((group) => used.has(group.id))
  if (next.length === groups.length && next.every((group, index) => group === groups[index])) {
    return groups
  }
  return next
}

export function packGroupsInPane(
  tabs: WorkspaceTab[],
  pane: WorkspacePaneId
): WorkspaceTab[] {
  const paneTabs = tabs.filter((tab) => tab.pane === pane)
  const rest = tabs.filter((tab) => tab.pane !== pane)
  const seenGroups = new Set<string>()
  const packed: WorkspaceTab[] = []

  for (const tab of paneTabs) {
    if (!tab.groupId) {
      packed.push(tab)
      continue
    }

    if (seenGroups.has(tab.groupId)) {
      continue
    }

    seenGroups.add(tab.groupId)
    packed.push(...paneTabs.filter((item) => item.groupId === tab.groupId))
  }

  return [...rest, ...packed]
}

export function buildTabBarItems(
  paneTabs: WorkspaceTab[],
  groups: WorkspaceTabGroup[]
): TabBarItem[] {
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const seen = new Set<string>()
  const items: TabBarItem[] = []

  for (const tab of paneTabs) {
    if (!tab.groupId) {
      items.push({ type: 'tab', tab })
      continue
    }

    if (seen.has(tab.groupId)) {
      continue
    }

    seen.add(tab.groupId)
    const group = groupById.get(tab.groupId)
    const members = paneTabs.filter((item) => item.groupId === tab.groupId)

    if (!group) {
      for (const member of members) {
        items.push({ type: 'tab', tab: member })
      }
      continue
    }

    items.push({ type: 'group', group, tabs: members })
  }

  return items
}

function paneAndRest(
  tabs: WorkspaceTab[],
  pane: WorkspacePaneId
): { paneTabs: WorkspaceTab[]; rest: WorkspaceTab[] } {
  return {
    paneTabs: tabs.filter((tab) => tab.pane === pane),
    rest: tabs.filter((tab) => tab.pane !== pane)
  }
}

function firstLastInGroup(
  paneTabs: WorkspaceTab[],
  groupId: string
): { first: WorkspaceTab | null; last: WorkspaceTab | null } {
  const members = paneTabs.filter((tab) => tab.groupId === groupId)
  return { first: members[0] ?? null, last: members[members.length - 1] ?? null }
}

function insertRelative(
  paneTabs: WorkspaceTab[],
  moving: WorkspaceTab[],
  targetId: string,
  place: 'before' | 'after'
): WorkspaceTab[] {
  const movingIds = new Set(moving.map((tab) => tab.id))
  const without = paneTabs.filter((tab) => !movingIds.has(tab.id))
  const targetIndex = without.findIndex((tab) => tab.id === targetId)
  if (targetIndex < 0) {
    return paneTabs
  }

  const insertAt = place === 'after' ? targetIndex + 1 : targetIndex
  return [...without.slice(0, insertAt), ...moving, ...without.slice(insertAt)]
}

export function applyTabBarDrop(
  tabs: WorkspaceTab[],
  pane: WorkspacePaneId,
  source: TabDragSource,
  dest: TabDropDest
): WorkspaceTab[] {
  const { paneTabs, rest } = paneAndRest(tabs, pane)

  if (source.type === 'tab') {
    const moving = paneTabs.find((tab) => tab.id === source.tabId)
    if (!moving) {
      return tabs
    }

    let nextGroupId = moving.groupId
    let targetId: string | null = null
    let place: 'before' | 'after' = 'after'

    if (dest.type === 'tab') {
      if (dest.tabId === source.tabId) {
        return tabs
      }
      const target = paneTabs.find((tab) => tab.id === dest.tabId)
      if (!target) {
        return tabs
      }
      nextGroupId = target.groupId
      targetId = target.id
      place = dest.place
    } else {
      const { first, last } = firstLastInGroup(paneTabs, dest.groupId)
      if (dest.place === 'into') {
        nextGroupId = dest.groupId
        targetId = last?.id ?? null
        place = 'after'
      } else if (dest.place === 'before') {
        nextGroupId = null
        targetId = first?.id ?? null
        place = 'before'
      } else {
        nextGroupId = null
        targetId = last?.id ?? null
        place = 'after'
      }
    }

    if (!targetId) {
      return tabs
    }

    const updated = paneTabs.map((tab) =>
      tab.id === source.tabId ? { ...tab, groupId: nextGroupId } : tab
    )
    const moved = updated.find((tab) => tab.id === source.tabId)
    if (!moved) {
      return tabs
    }

    const ordered = insertRelative(updated, [moved], targetId, place)
    return packGroupsInPane([...rest, ...ordered], pane)
  }

  const members = paneTabs.filter((tab) => tab.groupId === source.groupId)
  if (members.length === 0) {
    return tabs
  }

  let targetId: string | null = null
  let place: 'before' | 'after' = 'after'

  if (dest.type === 'tab') {
    const target = paneTabs.find((tab) => tab.id === dest.tabId)
    if (!target || target.groupId === source.groupId) {
      return tabs
    }
    if (target.groupId) {
      const { first, last } = firstLastInGroup(paneTabs, target.groupId)
      if (dest.place === 'before') {
        targetId = first?.id ?? target.id
        place = 'before'
      } else {
        targetId = last?.id ?? target.id
        place = 'after'
      }
    } else {
      targetId = target.id
      place = dest.place
    }
  } else {
    if (dest.groupId === source.groupId) {
      return tabs
    }
    const { first, last } = firstLastInGroup(paneTabs, dest.groupId)
    if (dest.place === 'into' || dest.place === 'after') {
      targetId = last?.id ?? null
      place = 'after'
    } else {
      targetId = first?.id ?? null
      place = 'before'
    }
  }

  if (!targetId) {
    return tabs
  }

  const ordered = insertRelative(paneTabs, members, targetId, place)
  return packGroupsInPane([...rest, ...ordered], pane)
}

export function assignTabGroup(
  tabs: WorkspaceTab[],
  pane: WorkspacePaneId,
  tabId: string,
  groupId: string | null
): WorkspaceTab[] {
  const next = tabs.map((tab) => (tab.id === tabId ? { ...tab, groupId } : tab))
  return packGroupsInPane(next, pane)
}

export function ungroupTabs(
  tabs: WorkspaceTab[],
  groupId: string
): WorkspaceTab[] {
  return tabs.map((tab) => (tab.groupId === groupId ? { ...tab, groupId: null } : tab))
}

/**
 * Split 開始時: アクティブとその右のタブを右ペインへ。順番は維持。
 * アクティブが無いときは右端 1 枚だけ移す。
 */
export function splitTabsAfterActive(
  tabs: WorkspaceTab[],
  groups: WorkspaceTabGroup[],
  activeId: string | null
): {
  tabs: WorkspaceTab[]
  groups: WorkspaceTabGroup[]
  primaryActiveId: string | null
  secondaryActiveId: string | null
} {
  const ordered = tabs.filter((tab) => tab.pane === 'primary')
  if (ordered.length === 0) {
    return { tabs, groups, primaryActiveId: activeId, secondaryActiveId: null }
  }

  const activeIndex = activeId ? ordered.findIndex((tab) => tab.id === activeId) : -1
  const moving =
    activeIndex >= 0 ? ordered.slice(activeIndex) : ordered.slice(-1)

  if (moving.length === 0) {
    return { tabs, groups, primaryActiveId: activeId, secondaryActiveId: null }
  }

  const movingIds = new Set(moving.map((tab) => tab.id))
  const remaining = ordered.filter((tab) => !movingIds.has(tab.id))
  const nextPrimaryActiveId = remaining[remaining.length - 1]?.id ?? null

  const nextTabs = tabs.map((tab) => {
    if (!movingIds.has(tab.id)) {
      return tab
    }

    const members = tab.groupId
      ? tabs.filter((item) => item.groupId === tab.groupId)
      : []
    const wholeGroupMoves =
      Boolean(tab.groupId) && members.length > 0 && members.every((item) => movingIds.has(item.id))

    return {
      ...tab,
      pane: 'secondary' as const,
      groupId: wholeGroupMoves ? tab.groupId : null
    }
  })

  const nextGroups = groups.map((group) => {
    const members = nextTabs.filter((tab) => tab.groupId === group.id)
    if (members.length === 0) {
      return group
    }

    return { ...group, pane: members[0].pane }
  })

  return {
    tabs: nextTabs,
    groups: pruneEmptyGroups(nextGroups, nextTabs),
    primaryActiveId: nextPrimaryActiveId,
    secondaryActiveId: moving[0].id
  }
}
