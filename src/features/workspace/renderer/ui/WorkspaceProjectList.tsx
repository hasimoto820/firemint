import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { WorkspaceEntry, WorkspaceState } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'

type WorkspaceProjectListProps = {
  onChanged: () => void
  disabled?: boolean
  /**
   * 指定すると各プロジェクトをツリーの親ノードとして描画し、フォーカス中の
   * プロジェクト配下にこの要素（例: FIRESTORE ツリー）を差し込む。
   */
  focusedChildren?: ReactNode
}

/**
 * 接続後の左ペイン用、コンパクトなプロジェクト一覧。
 * 一覧・追加・フォーカス切替が主役で、編集（表示名 / 色 / read-only / 削除）は
 * 各行の歯車から折りたたみで開く。focusedChildren を渡すとツリー表示になる。
 */
function WorkspaceProjectList({
  onChanged,
  disabled = false,
  focusedChildren
}: WorkspaceProjectListProps): React.JSX.Element {
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [colorDraft, setColorDraft] = useState('#607D8B')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const next = await window.api.workspace.getState()
    setState(next)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleAdd = async (): Promise<void> => {
    setError(null)
    const filePath = await window.api.connection.selectServiceAccountFile()

    if (!filePath) {
      return
    }

    setLoading(true)

    try {
      const result = await window.api.workspace.addEntry({
        serviceAccountPath: filePath,
        setFocused: true
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      await refresh()
      onChanged()
    } finally {
      setLoading(false)
    }
  }

  const handleFocus = async (projectId: string): Promise<void> => {
    if (state?.focusedProjectId === projectId && state.loadedProjectIds.includes(projectId)) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.workspace.setFocused(projectId)

      if (!result.ok) {
        setError(result.error)
        return
      }

      await refresh()
      onChanged()
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSettings = (entry: WorkspaceEntry): void => {
    if (settingsFor === entry.id) {
      setSettingsFor(null)
      return
    }

    setSettingsFor(entry.id)
    setLabelDraft(entry.label)
    setColorDraft(entry.color)
  }

  const handleSaveMeta = async (projectId: string): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.api.workspace.updateEntry(projectId, {
        label: labelDraft,
        color: colorDraft
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      await refresh()
      onChanged()
    } finally {
      setLoading(false)
    }
  }

  const handleToggleReadOnly = async (entry: WorkspaceEntry): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.api.workspace.updateEntry(entry.id, {
        readOnly: !entry.readOnly
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      await refresh()
      onChanged()
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (projectId: string): Promise<void> => {
    if (!window.confirm('このプロジェクトを名簿から削除しますか？')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.workspace.removeEntry(projectId)

      if (!result.ok) {
        setError(result.error)
        return
      }

      setSettingsFor(null)
      await refresh()
      onChanged()
    } finally {
      setLoading(false)
    }
  }

  const entries = state?.entries ?? []
  const loadedIds = new Set(state?.loadedProjectIds ?? [])
  const focusedId = state?.focusedProjectId ?? null
  const busy = disabled || loading
  const treeMode = focusedChildren !== undefined

  return (
    <section className="project-list">
      <div className="project-list__header">
        <span className="project-list__title">PROJECTS</span>
        <button
          type="button"
          className="project-list__add"
          onClick={() => void handleAdd()}
          disabled={busy}
          title="プロジェクトを追加"
          aria-label="プロジェクトを追加"
        >
          +
        </button>
      </div>

      {error && <p className="project-list__error">{error}</p>}

      {entries.length === 0 && <p className="project-list__empty">プロジェクトがありません</p>}

      <ul className="project-list__items">
        {entries.map((entry) => {
          const isFocused = entry.id === focusedId
          const isLoaded = loadedIds.has(entry.id)
          const isOpen = settingsFor === entry.id

          return (
            <li key={entry.id} className="project-list__entry">
              <div
                className={
                  isFocused
                    ? 'project-list__row project-list__row--focused'
                    : 'project-list__row'
                }
              >
                {treeMode && (
                  <button
                    type="button"
                    className="project-list__chevron"
                    onClick={() => void handleFocus(entry.id)}
                    disabled={busy}
                    aria-hidden
                    tabIndex={-1}
                  >
                    {isFocused ? '▾' : '▸'}
                  </button>
                )}
                <button
                  type="button"
                  className="project-list__select"
                  onClick={() => void handleFocus(entry.id)}
                  disabled={busy}
                >
                  <span
                    className="project-list__dot"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden
                  />
                  <span className="project-list__body">
                    <span className="project-list__label">{entry.label}</span>
                    <span className="project-list__meta">
                      {entry.readOnly ? 'read-only' : ''}
                      {entry.readOnly && isLoaded ? ' · ' : ''}
                      {isLoaded ? 'loaded' : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    isOpen
                      ? 'project-list__gear project-list__gear--open'
                      : 'project-list__gear'
                  }
                  onClick={() => handleToggleSettings(entry)}
                  disabled={busy}
                  title="プロジェクト設定"
                  aria-label="プロジェクト設定"
                  aria-expanded={isOpen}
                >
                  ⚙
                </button>
              </div>

              {treeMode && isFocused && (
                <div className="project-list__children">{focusedChildren}</div>
              )}

              {isOpen && (
                <div className="project-list__settings">
                  <label className="project-list__field">
                    表示名
                    <input
                      className="project-list__input"
                      value={labelDraft}
                      onChange={(event) => setLabelDraft(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="project-list__field">
                    色
                    <input
                      className="project-list__input project-list__input--color"
                      type="color"
                      value={colorDraft}
                      onChange={(event) => setColorDraft(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="project-list__readonly">
                    <input
                      type="checkbox"
                      checked={entry.readOnly}
                      onChange={() => void handleToggleReadOnly(entry)}
                      disabled={busy}
                    />
                    read-only（書込禁止）
                  </label>
                  <div className="project-list__settings-actions">
                    <Button onClick={() => void handleSaveMeta(entry.id)} disabled={busy}>
                      保存
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => void handleRemove(entry.id)}
                      disabled={busy}
                    >
                      削除
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default WorkspaceProjectList
