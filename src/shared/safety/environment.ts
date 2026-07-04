export type EnvironmentKind = 'production' | 'development' | 'unknown'

export function detectEnvironment(projectId: string): EnvironmentKind {
  const lower = projectId.toLowerCase()

  if (lower.includes('prod') || lower.includes('production')) {
    return 'production'
  }

  if (
    lower.includes('dev') ||
    lower.includes('staging') ||
    lower.includes('test') ||
    lower.includes('sandbox')
  ) {
    return 'development'
  }

  return 'unknown'
}

export function environmentLabel(kind: EnvironmentKind): string {
  switch (kind) {
    case 'production':
      return '本番'
    case 'development':
      return '開発'
    default:
      return '不明'
  }
}
