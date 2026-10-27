import type { ExportDocument } from '../../shared/types'
import { legacyToTypedFields } from '../typed/legacy'
import { encodeTypedEntity } from './entity_typed'

/** __firemint_type 形式のドキュメントを、公式ダンプのエンティティにする（self_check 用） */
export function documentToEntity(document: ExportDocument, app: string): Buffer {
  return encodeTypedEntity({ path: document.path, fields: legacyToTypedFields(document.data) }, app)
}
