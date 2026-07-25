export type AutocompleteKind = 'collection_path' | 'field_name'

export type AutocompleteItem = {
  kind: AutocompleteKind
  value: string
}

export type AutocompleteProjectPool = {
  collection_path: Set<string>
  field_name: Set<string>
}
