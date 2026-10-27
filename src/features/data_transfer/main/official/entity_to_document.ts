import type { ExportDocument } from '../../shared/types'
import { typedFieldsToLegacy } from '../typed/legacy'
import { decodeTypedEntity } from './entity_typed'

export { projectIdFromApp } from './entity_typed'

export type ParsedOfficialEntity = {
  document: ExportDocument
  projectId: string | null
}

/** 公式ダンプのエンティティを、__firemint_type 形式のドキュメントにする（diff・self_check 用） */
export function parseOfficialEntity(record: Buffer): ParsedOfficialEntity | null {
  const decoded = decodeTypedEntity(record)
  if (!decoded) {
    return null
  }

  const segments = decoded.document.path.split('/')
  return {
    document: {
      id: segments[segments.length - 1],
      path: decoded.document.path,
      data: typedFieldsToLegacy(decoded.document.fields)
    },
    projectId: decoded.projectId
  }
}

export function entityRecordToDocument(record: Buffer): ExportDocument | null {
  return parseOfficialEntity(record)?.document ?? null
}
