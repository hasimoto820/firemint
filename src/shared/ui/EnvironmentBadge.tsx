import type { EnvironmentKind } from '@shared/safety/environment'
import { environmentLabel } from '@shared/safety/environment'

type EnvironmentBadgeProps = {
  environment: EnvironmentKind
}

function EnvironmentBadge({ environment }: EnvironmentBadgeProps): React.JSX.Element {
  return <span className={`environment-badge environment-badge--${environment}`}>{environmentLabel(environment)}</span>
}

export default EnvironmentBadge
