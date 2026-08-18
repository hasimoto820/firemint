import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const javaHome = 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.12.8-hotspot'
const javaBin = `${javaHome}\\bin`

if (!existsSync(`${javaBin}\\java.exe`)) {
  console.error(`[emulators] JDK 21 が見つかりません: ${javaBin}\\java.exe`)
  process.exit(1)
}

process.env.JAVA_HOME = javaHome
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function prependPath(key) {
  const current = process.env[key]
  if (current === undefined) {
    return
  }
  if (!current.split(';').includes(javaBin)) {
    process.env[key] = `${javaBin};${current}`
  }
}

prependPath('Path')
prependPath('PATH')

const extraArgs = process.argv.slice(2)
const firebaseArgs =
  extraArgs.length > 0 ? extraArgs : ['emulators:start', '--only', 'firestore']

const child = spawn('firebase', firebaseArgs, {
  stdio: 'inherit',
  shell: true,
  env: process.env
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
