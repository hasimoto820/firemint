import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  AutocompleteItem,
  AutocompleteKind,
  AutocompleteProjectPool
} from '@features/autocomplete/shared/types'
import {
  addCollectionPathsToPool,
  addFieldNamesToPool,
  createEmptyProjectPool,
  queryAutocompletePool,
  removeCollectionPathsFromPool
} from './catalog'

type AutocompleteApi = {
  revision: number
  addCollectionPaths: (projectId: string, paths: string[]) => void
  addFieldNames: (projectId: string, fieldNames: string[]) => void
  removeCollectionPaths: (projectId: string, paths: string[]) => void
  query: (
    projectId: string,
    text: string,
    kinds?: AutocompleteKind[]
  ) => AutocompleteItem[]
}

const AutocompleteContext = createContext<AutocompleteApi | null>(null)

type AutocompleteProviderProps = {
  children: ReactNode
}

function AutocompleteProvider({ children }: AutocompleteProviderProps): React.JSX.Element {
  const poolsRef = useRef<Map<string, AutocompleteProjectPool>>(new Map())
  const [revision, setRevision] = useState(0)

  const ensurePool = useCallback((projectId: string): AutocompleteProjectPool => {
    const existing = poolsRef.current.get(projectId)

    if (existing) {
      return existing
    }

    const created = createEmptyProjectPool()
    poolsRef.current.set(projectId, created)
    return created
  }, [])

  const bump = useCallback((): void => {
    setRevision((current) => current + 1)
  }, [])

  const addCollectionPaths = useCallback(
    (projectId: string, paths: string[]): void => {
      if (!projectId || paths.length === 0) {
        return
      }

      if (addCollectionPathsToPool(ensurePool(projectId), paths)) {
        bump()
      }
    },
    [bump, ensurePool]
  )

  const addFieldNames = useCallback(
    (projectId: string, fieldNames: string[]): void => {
      if (!projectId || fieldNames.length === 0) {
        return
      }

      if (addFieldNamesToPool(ensurePool(projectId), fieldNames)) {
        bump()
      }
    },
    [bump, ensurePool]
  )

  const removeCollectionPaths = useCallback(
    (projectId: string, paths: string[]): void => {
      if (!projectId || paths.length === 0) {
        return
      }

      const pool = poolsRef.current.get(projectId)

      if (!pool) {
        return
      }

      if (removeCollectionPathsFromPool(pool, paths)) {
        bump()
      }
    },
    [bump]
  )

  const query = useCallback(
    (projectId: string, text: string, kinds?: AutocompleteKind[]): AutocompleteItem[] => {
      if (!projectId) {
        return []
      }

      const pool = poolsRef.current.get(projectId)

      if (!pool) {
        return []
      }

      return queryAutocompletePool(pool, text, kinds)
    },
    []
  )

  const api = useMemo<AutocompleteApi>(
    () => ({
      revision,
      addCollectionPaths,
      addFieldNames,
      removeCollectionPaths,
      query
    }),
    [addCollectionPaths, addFieldNames, query, removeCollectionPaths, revision]
  )

  return <AutocompleteContext.Provider value={api}>{children}</AutocompleteContext.Provider>
}

function useAutocompleteApi(): AutocompleteApi {
  const api = useContext(AutocompleteContext)

  if (!api) {
    throw new Error('useAutocompleteApi must be used within AutocompleteProvider')
  }

  return api
}

/** Provider 外でも落とさない（任意配線用）。無いときは no-op / 空配列。 */
function useOptionalAutocompleteApi(): AutocompleteApi {
  const api = useContext(AutocompleteContext)

  return useMemo<AutocompleteApi>(() => {
    if (api) {
      return api
    }

    return {
      revision: 0,
      addCollectionPaths: () => undefined,
      addFieldNames: () => undefined,
      removeCollectionPaths: () => undefined,
      query: () => []
    }
  }, [api])
}

export {
  AutocompleteProvider,
  useAutocompleteApi,
  useOptionalAutocompleteApi
}
