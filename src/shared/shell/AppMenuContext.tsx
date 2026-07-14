import { createContext, useContext, useEffect } from 'react'
import type { DependencyList } from 'react'
import type { AppMenuContextActions } from './build_app_menus'

/**
 * 画面が文脈依存メニュー（Edit / エクスポート等）のハンドラを登録するための窓口。
 * shell 側は「登録された関数を呼ぶだけ」で、feature を import しない。
 */
export type RegisterAppMenu = (actions: AppMenuContextActions | null) => void

const AppMenuRegistryContext = createContext<RegisterAppMenu>(() => undefined)

export const AppMenuRegistryProvider = AppMenuRegistryContext.Provider

/**
 * 画面から文脈依存メニューを登録する。deps が変わるたびに登録し直し、
 * アンマウント時に解除する（= メニューは無効化に戻る）。
 */
export function useRegisterAppMenu(
  actions: AppMenuContextActions,
  deps: DependencyList
): void {
  const register = useContext(AppMenuRegistryContext)

  useEffect(() => {
    register(actions)
    return () => register(null)
    // actions は deps から再構築される前提で、deps のみを依存にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, ...deps])
}
