import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import GoogleConnectDialog from '@features/connection/renderer/ui/GoogleConnectDialog'
import EmulatorConnectDialog from '@features/emulator/renderer/ui/EmulatorConnectDialog'
import {
  DEFAULT_ENTRY_COLOR,
  workspaceAuthLabel,
  type WorkspaceEntry,
  type WorkspaceState
} from '@features/workspace/shared/types'
import Button from '@shared/ui/Button'
import SplitPane from '@shared/ui/SplitPane'
import { confirmAction } from '@shared/ui/confirmAction'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type WorkspaceProjectListProps = {
  onChanged: () => void
  disabled?: boolean
  /** 親が名簿／接続を更新したときに再取得する */
  refreshToken?: number
  /**
   * 指定すると各プロジェクトをツリーの親ノードとして描画し、フォーカス中の
   * プロジェクト配下にこの要素（例: FIRESTORE ツリー）を差し込む。
   */
  focusedChildren?: ReactNode
}

/**
 * 接続後の左ペイン用、コンパクトなプロジェクト一覧。
 * 一覧・追加・フォーカス切替が主役で、編集（表示名 / 色 / read-only / 登録解除）は
 * 各行の歯車から折りたたみで開く。focusedChildren を渡すとツリー表示になる。
 */
function WorkspaceProjectList({
  onChanged,
  disabled = false,
  refreshToken = 0,
  focusedChildren
}: WorkspaceProjectListProps): React.JSX.Element {
  const t = useT()
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [colorDraft, setColorDraft] = useState(DEFAULT_ENTRY_COLOR)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addMenuPos, setAddMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [googleOpen, setGoogleOpen] = useState(false)
  const [emulatorOpen, setEmulatorOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const next = await window.api.workspace.getState()
    setState(next)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshToken])

  // 「+」のメニューは、外をクリックするか Esc で閉じる
  useEffect(() => {
    if (!addMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setAddMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setAddMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [addMenuOpen])

  const handleAddConnected = async (): Promise<void> => {
    await refresh()
    onChanged()
  }

  const handleAddJson = async (): Promise<void> => {
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

  const handleDisconnect = async (projectId: string): Promise<void> => {
    if (!(await confirmAction(t('workspace.disconnect_confirm')))) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.workspace.unloadProject(projectId)

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

  const handleDeleteEmulator = async (projectId: string): Promise<void> => {
    if (!(await confirmAction(t('emulator.delete_project_confirm')))) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.emulator.deleteProject({ projectId })

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

  const handleRemove = async (projectId: string): Promise<void> => {
    if (!(await confirmAction(t('workspace.unregister_confirm')))) {
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

  const loadedIds = new Set(state?.loadedProjectIds ?? [])
  const entries = (state?.entries ?? []).filter((entry) => loadedIds.has(entry.id))
  const focusedId = state?.focusedProjectId ?? null
  const busy = disabled || loading
  const treeMode = focusedChildren !== undefined

  const entryList = (
    <ul className="project-list__items">
      {entries.map((entry) => {
        const isFocused = entry.id === focusedId
        const isLoaded = loadedIds.has(entry.id)
        const isOpen = settingsFor === entry.id

        return (
          <li key={entry.id} className="project-list__entry">
            <div
              className={
                isFocused ? 'project-list__row project-list__row--focused' : 'project-list__row'
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
                    {workspaceAuthLabel(entry.authType)}
                    {entry.readOnly ? ' · read-only' : ''}
                    {isLoaded ? ' · loaded' : ''}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={
                  isOpen ? 'project-list__gear project-list__gear--open' : 'project-list__gear'
                }
                onClick={() => handleToggleSettings(entry)}
                disabled={busy}
                title={t('workspace.project_settings')}
                aria-label={t('workspace.project_settings')}
                aria-expanded={isOpen}
              >
                ⚙
              </button>
            </div>

            {isOpen && (
              <div className="project-list__settings">
                <label className="project-list__field">
                  {t('workspace.display_name')}
                  <input
                    className="project-list__input"
                    value={labelDraft}
                    onChange={(event) => setLabelDraft(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="project-list__field">
                  {t('workspace.color')}
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
                  {t('workspace.read_only')}
                </label>
                <div className="project-list__settings-actions">
                  <Button onClick={() => void handleSaveMeta(entry.id)} disabled={busy}>
                    {t('common.save')}
                  </Button>
                  <Button onClick={() => void handleDisconnect(entry.id)} disabled={busy}>
                    {t('common.disconnect')}
                  </Button>
                  {entry.authType === 'emulator' ? (
                    <Button
                      variant="danger"
                      onClick={() => void handleDeleteEmulator(entry.id)}
                      disabled={busy || entry.readOnly}
                    >
                      {t('common.delete')}
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => void handleRemove(entry.id)}
                      disabled={busy}
                    >
                      {t('workspace.unregister')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <section className="project-list">
      <div className="project-list__header">
        <span className="project-list__title">{t('workspace.projects')}</span>
        <div className="project-list__add-wrap" ref={addMenuRef}>
          <button
            type="button"
            className="project-list__add"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setAddMenuPos({ top: rect.bottom + 4, left: rect.left })
              setAddMenuOpen((open) => !open)
            }}
            disabled={busy}
            title={t('workspace.add_project')}
            aria-label={t('workspace.add_project')}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
          >
            +
          </button>
          {addMenuOpen && (
            <div
              className="project-list__add-menu"
              role="menu"
              style={{ top: addMenuPos.top, left: addMenuPos.left }}
            >
              <button
                type="button"
                role="menuitem"
                className="project-list__add-item"
                onClick={() => {
                  setAddMenuOpen(false)
                  setGoogleOpen(true)
                }}
              >
                {t('workspace.add_google')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="project-list__add-item"
                onClick={() => {
                  setAddMenuOpen(false)
                  void handleAddJson()
                }}
              >
                {t('workspace.add_json')}
              </button>
              <div className="project-list__add-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="project-list__add-item"
                onClick={() => {
                  setAddMenuOpen(false)
                  setEmulatorOpen(true)
                }}
              >
                {t('workspace.add_emulator')}
              </button>
            </div>
          )}
        </div>
      </div>

      <GoogleConnectDialog
        open={googleOpen}
        onClose={() => setGoogleOpen(false)}
        onConnected={() => void handleAddConnected()}
      />
      <EmulatorConnectDialog
        open={emulatorOpen}
        onClose={() => setEmulatorOpen(false)}
        onConnected={handleAddConnected}
      />

      {error && <p className="project-list__error">{error}</p>}

      {entries.length === 0 && <p className="project-list__empty">{t('workspace.no_connected')}</p>}

      {treeMode ? (
        <SplitPane
          className="project-list__split"
          orientation="vertical"
          storageKey="shell.sidebar.tree"
          defaultSize={32}
          unit="percent"
          minFirst={72}
          minSecond={120}
          ariaLabel={t('workspace.list_height')}
          first={
            <div className="project-list__items-wrap" data-area="projects" tabIndex={-1}>
              {entryList}
            </div>
          }
          second={<div className="project-list__children">{focusedChildren}</div>}
        />
      ) : (
        entryList
      )}
    </section>
  )
}

export default WorkspaceProjectList
