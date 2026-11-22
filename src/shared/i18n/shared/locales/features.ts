import { accountMessages } from '@features/account/shared/messages'
import { scriptRunnerMessages } from '@features/script_runner/shared/messages'
import { emulatorMessages } from '@features/emulator/shared/messages'
import { connectionMessages } from '@features/connection/shared/messages'
import { transportMessages } from '@features/transport/shared/messages'
import { dataTransferMessages } from '@features/data_transfer/shared/messages'
import { workspaceMessages } from '@features/workspace/shared/messages'
import { queryMessages } from '@features/query/shared/messages'
import { uiMessages } from '@shared/ui/messages'
import { explorerMessages } from '@features/explorer/shared/messages'
import type { MessageTable } from '../messages'

/** feature ごとの訳（features/<名前>/shared/messages.ts）。足したらここに並べる */
export const featureMessages: MessageTable[] = [
  explorerMessages,
  uiMessages,
  queryMessages,
  workspaceMessages,
  dataTransferMessages,
  transportMessages,
  connectionMessages,
  emulatorMessages,
  scriptRunnerMessages,
  accountMessages
]
