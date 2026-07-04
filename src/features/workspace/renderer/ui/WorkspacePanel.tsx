import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceEntry, WorkspaceState } from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'

type WorkspacePanelProps = {
  onChanged: () => void
  disabled?: boolean
}

function WorkspacePanel({ onChanged, disabled = false }: WorkspacePanelProps): React.JSX.Element {
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [colorDraft, setColorDraft] = useState('#607D8B')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const next = await window.api.workspace.getState()
    setState(next)
    setSelectedId(next.focusedProjectId)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!state?.focusedProjectId) {
      return
    }

    const entry = state.entries.find((item) => item.id === state.focusedProjectId)

    if (entry) {
      setLabelDraft(entry.label)
      setColorDraft(entry.color)
      setSelectedId(entry.id)
    }
  }, [state])

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

      await refresh()
      onChanged()
    } finally {
      setLoading(false)
    }
  }

  const handleSaveMeta = async (): Promise<void> => {
    if (!selectedId) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.workspace.updateEntry(selectedId, {
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

  const entries = state?.entries ?? []
  const loadedIds = new Set(state?.loadedProjectIds ?? [])
  const focusedId = state?.focusedProjectId ?? null

  return (
    <section className="workspace-panel">
      <div className="workspace-panel__header">
        <h2 className="workspace-panel__title">プロジェクト</h2>
        <Button onClick={() => void handleAdd()} disabled={disabled || loading}>
          追加
        </Button>
      </div>

      {error && <p className="workspace-panel__error">{error}</p>}

      {entries.length === 0 && (
        <p className="workspace-panel__empty">プロジェクトがありません</p>
      )}

      <ul className="workspace-panel__list">
        {entries.map((entry) => {
          const isFocused = entry.id === focusedId
          const isLoaded = loadedIds.has(entry.id)

          return (
            <li key={entry.id}>
              <button
                type="button"
                className={
                  isFocused
                    ? 'workspace-panel__item workspace-panel__item--focused'
                    : 'workspace-panel__item'
                }
                onClick={() => void handleFocus(entry.id)}
                disabled={disabled || loading}
              >
                <span
                  className="workspace-panel__dot"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                <span className="workspace-panel__item-body">
                  <span className="workspace-panel__label">{entry.label}</span>
                  <span className="workspace-panel__meta">
                    {entry.id}
                    {entry.readOnly ? ' · read-only' : ''}
                    {isLoaded ? ' · loaded' : ''}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {selectedId && (
        <div className="workspace-panel__editor">
          <label className="workspace-panel__field">
            表示名
            <input
              className="workspace-panel__input"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              disabled={disabled || loading}
            />
          </label>
          <label className="workspace-panel__field">
            色
            <input
              className="workspace-panel__input workspace-panel__input--color"
              type="color"
              value={colorDraft}
              onChange={(event) => setColorDraft(event.target.value)}
              disabled={disabled || loading}
            />
          </label>
          <div className="workspace-panel__editor-actions">
            <Button onClick={() => void handleSaveMeta()} disabled={disabled || loading}>
              保存
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleRemove(selectedId)}
              disabled={disabled || loading}
            >
              削除
            </Button>
          </div>
          {entries
            .filter((entry) => entry.id === selectedId)
            .map((entry) => (
              <label key={entry.id} className="workspace-panel__readonly">
                <input
                  type="checkbox"
                  checked={entry.readOnly}
                  onChange={() => void handleToggleReadOnly(entry)}
                  disabled={disabled || loading}
                />
                read-only（書込禁止）
              </label>
            ))}
        </div>
      )}
    </section>
  )
}

export default WorkspacePanel
