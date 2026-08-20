import { useEffect, useRef, useState } from 'react'
import type { DiscoveredEmulator } from '@features/emulator/shared/types'
import Button from '@shared/ui/Button'
import { useT } from '@shared/i18n/renderer/I18nProvider'

type EmulatorConnectDialogProps = {
  open: boolean
  onClose: () => void
  onConnected: () => void | Promise<void>
}

function candidateKey(candidate: DiscoveredEmulator): string {
  return `${candidate.firestoreHost}::${candidate.projectId}`
}

function EmulatorConnectDialog({
  open,
  onClose,
  onConnected
}: EmulatorConnectDialogProps): React.JSX.Element | null {
  const t = useT()
  const onCloseRef = useRef(onClose)
  const onConnectedRef = useRef(onConnected)
  onCloseRef.current = onClose
  onConnectedRef.current = onConnected

  const [phase, setPhase] = useState<'discovering' | 'none' | 'pick' | 'connecting'>('discovering')
  const [candidates, setCandidates] = useState<DiscoveredEmulator[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discoverToken, setDiscoverToken] = useState(0)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    setPhase('discovering')
    setCandidates([])
    setSelectedKey(null)
    setBusy(false)
    setError(null)

    const connectOne = async (
      candidate: DiscoveredEmulator,
      list: DiscoveredEmulator[]
    ): Promise<void> => {
      setBusy(true)
      setPhase('connecting')
      setError(null)

      try {
        const connected = await window.api.connection.connectEmulator({
          host: candidate.firestoreHost,
          projectId: candidate.projectId
        })

        if (cancelled) {
          return
        }

        if (!connected.ok) {
          setError(connected.error)
          setPhase(list.length > 0 ? 'pick' : 'none')
          return
        }

        await onConnectedRef.current()
        onCloseRef.current()
      } finally {
        if (!cancelled) {
          setBusy(false)
        }
      }
    }

    void (async () => {
      const result = await window.api.emulator.discover()
      if (cancelled) {
        return
      }

      if (!result.ok) {
        setError(result.error)
        setPhase('none')
        return
      }

      if (result.data.length === 0) {
        setPhase('none')
        return
      }

      setCandidates(result.data)
      setSelectedKey(candidateKey(result.data[0]))

      if (result.data.length === 1) {
        await connectOne(result.data[0], result.data)
        return
      }

      setPhase('pick')
    })()

    return () => {
      cancelled = true
    }
  }, [open, discoverToken])

  const handleConnectPicked = async (): Promise<void> => {
    const selected = candidates.find((candidate) => candidateKey(candidate) === selectedKey)
    if (!selected) {
      setError(t('emulator.discover_pick'))
      return
    }

    setBusy(true)
    setPhase('connecting')
    setError(null)

    try {
      const connected = await window.api.connection.connectEmulator({
        host: selected.firestoreHost,
        projectId: selected.projectId
      })

      if (!connected.ok) {
        setError(connected.error)
        setPhase('pick')
        return
      }

      await onConnected()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return null
  }

  const lead =
    phase === 'pick'
      ? t('emulator.discover_pick')
      : phase === 'none'
        ? t('emulator.discover_none')
        : t('emulator.discover_lead')

  return (
    <div className="project-export-dialog" role="dialog" aria-modal="true">
      <div className="project-export-dialog__backdrop" onClick={busy ? undefined : onClose} />
      <div className="project-export-dialog__panel">
        <header className="project-export-dialog__header">
          <h2 className="project-export-dialog__title">{t('emulator.title')}</h2>
          <p className="project-export-dialog__lead">{lead}</p>
        </header>

        {phase === 'none' && (
          <p className="project-export-dialog__hint">{t('emulator.process_hint')}</p>
        )}

        {phase === 'pick' && (
          <ul className="workspace-panel__list">
            {candidates.map((candidate) => {
              const key = candidateKey(candidate)
              const selected = key === selectedKey

              return (
                <li key={key}>
                  <button
                    type="button"
                    className={
                      selected
                        ? 'workspace-panel__item workspace-panel__item--focused'
                        : 'workspace-panel__item'
                    }
                    onClick={() => setSelectedKey(key)}
                    disabled={busy}
                  >
                    <span className="workspace-panel__item-body">
                      <span className="workspace-panel__label">{candidate.firestoreHost}</span>
                      <span className="workspace-panel__meta">
                        {candidate.projectId || t('emulator.discover_unnamed')}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {(phase === 'discovering' || phase === 'connecting' || busy) && (
          <p className="project-export-dialog__hint">
            {phase === 'connecting' ? t('common.busy') : t('emulator.discovering')}
          </p>
        )}
        {error && <p className="project-export-dialog__error">{error}</p>}

        <div className="project-export-dialog__actions">
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          {phase === 'none' && (
            <Button
              variant="primary"
              onClick={() => setDiscoverToken((current) => current + 1)}
              disabled={busy}
            >
              {t('emulator.discover_retry')}
            </Button>
          )}
          {phase === 'pick' && (
            <Button
              variant="primary"
              onClick={() => void handleConnectPicked()}
              disabled={busy || !selectedKey}
            >
              {t('emulator.import')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default EmulatorConnectDialog
