import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = {
  '@shared': resolve('src/shared'),
  '@features': resolve('src/features')
}

export default defineConfig({
  main: {
    resolve: {
      alias: sharedAlias
    }
  },
  preload: {
    resolve: {
      alias: sharedAlias
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/app'),
        ...sharedAlias
      }
    },
    plugins: [react()]
  }
})
