import type {WorkspaceProject} from '../../features/workspace/shared/project';
import type {StringKey} from '../i18n/i18n';

type TranslateFn = (key: StringKey, vars?: Record<string, string | number>) => string;

export type StackRoute =
  | {name: 'home'}
  | {name: 'account'}
  | {name: 'settings'}
  | {name: 'snippets'}
  | {name: 'transfer'}
  | {name: 'connection'}
  | {name: 'projects'}
  | {name: 'collections'; project: WorkspaceProject}
  | {name: 'documents'; project: WorkspaceProject; collectionPath: string}
  | {name: 'detail'; project: WorkspaceProject; documentPath: string}
  | {name: 'auth_users'; project: WorkspaceProject}
  | {name: 'auth_user_detail'; project: WorkspaceProject; uid: string};

export type Page = {
  id: string;
  stack: StackRoute[];
};

export function createPage(stack: StackRoute[] = [{name: 'home'}]): Page {
  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    stack,
  };
}

export function topRoute(page: Page): StackRoute {
  return page.stack[page.stack.length - 1] ?? {name: 'home'};
}

export function pushRoute(page: Page, route: StackRoute): Page {
  return {...page, stack: [...page.stack, route]};
}

export function popRoute(page: Page): Page {
  if (page.stack.length <= 1) {
    return page;
  }
  return {...page, stack: page.stack.slice(0, -1)};
}

export function routeKey(route: StackRoute): string {
  switch (route.name) {
    case 'home':
      return 'home';
    case 'account':
      return 'account';
    case 'settings':
      return 'settings';
    case 'snippets':
      return 'snippets';
    case 'transfer':
      return 'transfer';
    case 'connection':
      return 'connection';
    case 'projects':
      return 'projects';
    case 'collections':
      return `collections:${route.project.projectId}`;
    case 'documents':
      return `documents:${route.project.projectId}:${route.collectionPath}`;
    case 'detail':
      return `detail:${route.documentPath}`;
    case 'auth_users':
      return `auth_users:${route.project.projectId}`;
    case 'auth_user_detail':
      return `auth_user_detail:${route.project.projectId}:${route.uid}`;
  }
}

export function pageLabel(page: Page, t: TranslateFn): string {
  const route = topRoute(page);
  switch (route.name) {
    case 'home':
      return t('common.home');
    case 'account':
      return t('account.title');
    case 'settings':
      return t('settings.title');
    case 'snippets':
      return t('common.snippets');
    case 'transfer':
      return t('common.transferTitle');
    case 'connection':
      return t('home.card.auth');
    case 'projects':
      return t('workspace.projectList.title');
    case 'collections':
      return route.project.label || route.project.projectId;
    case 'documents':
      return `${route.project.label || route.project.projectId}/${route.collectionPath}`;
    case 'detail':
      return `${route.project.label || route.project.projectId}/${route.documentPath}`;
    case 'auth_users':
      return `${route.project.label || route.project.projectId}/Auth`;
    case 'auth_user_detail':
      return `${route.project.label || route.project.projectId}/Auth/${route.uid}`;
  }
}
