import {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {refreshCachedEntitlement} from '../features/account/native/entitlementCache';
import {AccountScreen} from '../features/account/ui/AccountScreen';
import {InviteWatcher} from '../features/account/ui/InviteWatcher';
import {AuthUserDetailScreen} from '../features/auth_users/ui/AuthUserDetailScreen';
import {AuthUsersListScreen} from '../features/auth_users/ui/AuthUsersListScreen';
import {ConnectionScreen} from '../features/connection/ui/ConnectionScreen';
import {TransferScreen} from '../features/data_transfer/ui/TransferScreen';
import {CollectionListScreen} from '../features/explorer/ui/CollectionListScreen';
import {DocumentDetailScreen} from '../features/explorer/ui/DocumentDetailScreen';
import {DocumentListScreen} from '../features/explorer/ui/DocumentListScreen';
import {SnippetListScreen} from '../features/snippet/ui/SnippetListScreen';
import type {WorkspaceProject} from '../features/workspace/shared/project';
import {ProjectListScreen} from '../features/workspace/ui/ProjectListScreen';
import {ping} from '../shared/bridge_ping';
import {LocaleRoot} from '../shared/i18n/i18n';
import {TextScaleRoot} from '../shared/settings/text_scale';
import {ThemeRoot} from '../shared/settings/theme';
import {ShellRoot} from '../shared/shell/chrome';
import {TabListScreen} from '../shared/shell/TabListScreen';
import {
  createPage,
  popRoute,
  pushRoute,
  routeKey,
  type Page,
  type StackRoute,
} from '../shared/shell/tabs';
import {HomeScreen} from './HomeScreen';
import {SettingsScreen} from './SettingsScreen';
import {SplashScreen} from './SplashScreen';

const first = createPage();

// 起動時の準備（ユーザーと利用状態の確定）を、ロゴ画面で待つ上限。
// オフラインや回線が遅い時に、ロゴ画面で止まらないようにする。
const STARTUP_WAIT_MAX_MS = 5000;

export default function App() {
  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState<Page[]>([first]);
  const [activeId, setActiveId] = useState(first.id);
  const [listing, setListing] = useState(false);

  useEffect(() => {
    const started = Date.now();

    // 基本ルール0: 匿名ユーザー（＝トライアルの起点）は、アプリの初回起動時に作る
    // （refreshCachedEntitlement の中の ensureUser）。続けて利用状態まで確定させ、
    // それが済むまでロゴ画面に留まる（ホームが出た時点で、門の判定に使う値が揃っている）。
    // オフライン等で失敗しても、上限を超えても、アプリは使えるようにホームへ進む。
    // その場合は、ホームのカードを押した時・アカウント画面を開いた時に再試行する。
    const prepared = Promise.race([
      refreshCachedEntitlement().catch(() => null),
      new Promise<null>(resolve => setTimeout(() => resolve(null), STARTUP_WAIT_MAX_MS)),
    ]);

    Promise.all([ping().catch(() => 'ng'), prepared]).finally(() => {
      const wait = Math.max(0, 600 - (Date.now() - started));
      setTimeout(() => setReady(true), wait);
    });
  }, []);

  function patchActive(fn: (page: Page) => Page) {
    setPages(cur => cur.map(page => (page.id === activeId ? fn(page) : page)));
  }

  function push(route: StackRoute) {
    patchActive(page => pushRoute(page, route));
    setListing(false);
  }

  function pop() {
    patchActive(popRoute);
  }

  function plus() {
    const page = createPage();
    setPages(cur => [...cur, page]);
    setActiveId(page.id);
    setListing(false);
  }

  function activate(id: string) {
    setActiveId(id);
    setListing(false);
  }

  function removePage(id: string) {
    setPages(cur => {
      const next = cur.filter(page => page.id !== id);
      const kept = next.length > 0 ? next : [createPage()];
      if (id === activeId || !kept.some(page => page.id === activeId)) {
        setActiveId(kept[kept.length - 1].id);
      }
      return kept;
    });
  }

  function openDetailInNewTab(project: WorkspaceProject, documentPath: string) {
    const cur = pages.find(page => page.id === activeId);
    if (!cur) {
      return;
    }
    const page = createPage([
      ...cur.stack,
      {name: 'detail', project, documentPath},
    ]);
    setPages(list => [...list, page]);
    setActiveId(page.id);
    setListing(false);
  }

  function renderRoute(route: StackRoute) {
    if (route.name === 'home') {
      return (
        <HomeScreen
          onOpenConnection={() => push({name: 'connection'})}
          onOpenProjects={() => push({name: 'projects'})}
          onOpenSnippets={() => push({name: 'snippets'})}
          onOpenTransfer={() => push({name: 'transfer'})}
          onOpenSettings={() => push({name: 'settings'})}
          onOpenAccount={() => push({name: 'account'})}
        />
      );
    }
    if (route.name === 'connection') {
      return <ConnectionScreen onBack={pop} />;
    }
    if (route.name === 'account') {
      return <AccountScreen onBack={pop} />;
    }
    if (route.name === 'settings') {
      return <SettingsScreen onBack={pop} />;
    }
    if (route.name === 'snippets') {
      return <SnippetListScreen onBack={pop} />;
    }
    if (route.name === 'transfer') {
      return <TransferScreen onBack={pop} />;
    }
    if (route.name === 'projects') {
      return (
        <ProjectListScreen
          onBack={pop}
          onOpenProject={project => push({name: 'collections', project})}
        />
      );
    }
    if (route.name === 'collections') {
      return (
        <CollectionListScreen
          project={route.project}
          onBack={pop}
          onOpenCollection={collectionPath =>
            push({
              name: 'documents',
              project: route.project,
              collectionPath,
            })
          }
          onOpenAuthUsers={() => push({name: 'auth_users', project: route.project})}
        />
      );
    }
    if (route.name === 'auth_users') {
      return (
        <AuthUsersListScreen
          project={route.project}
          onBack={pop}
          onOpenUser={uid =>
            push({name: 'auth_user_detail', project: route.project, uid})
          }
        />
      );
    }
    if (route.name === 'auth_user_detail') {
      return (
        <AuthUserDetailScreen
          project={route.project}
          uid={route.uid}
          onBack={pop}
          onDeleted={pop}
        />
      );
    }
    if (route.name === 'documents') {
      return (
        <DocumentListScreen
          project={route.project}
          collectionPath={route.collectionPath}
          onBack={pop}
          onOpenDocument={doc =>
            push({
              name: 'detail',
              project: route.project,
              documentPath: doc.path,
            })
          }
          onOpenDocumentInNewTab={doc =>
            openDetailInNewTab(route.project, doc.path)
          }
        />
      );
    }
    return (
      <DocumentDetailScreen
        project={route.project}
        documentPath={route.documentPath}
        onBack={pop}
        onDeleted={pop}
        onOpenSubcollection={subPath =>
          push({
            name: 'documents',
            project: route.project,
            collectionPath: subPath,
          })
        }
      />
    );
  }

  return (
    <SafeAreaProvider>
      <LocaleRoot>
      <ThemeRoot>
      <TextScaleRoot>
        <InviteWatcher />
        {ready ? (
          <ShellRoot onPlus={plus} onTabs={() => setListing(v => !v)}>
          <View style={styles.root}>
            {pages.map(page => {
              const front = page.id === activeId && !listing;
              return (
                <View
                  key={page.id}
                  style={front ? styles.front : styles.hidden}
                  pointerEvents={front ? 'auto' : 'none'}>
                  {page.stack.map((route, index) => {
                    const top = index === page.stack.length - 1;
                    const show = front && top;
                    return (
                      <View
                        key={`${page.id}:${index}:${routeKey(route)}`}
                        style={show ? styles.front : styles.hidden}
                        pointerEvents={show ? 'auto' : 'none'}>
                        {renderRoute(route)}
                      </View>
                    );
                  })}
                </View>
              );
            })}
            {listing ? (
              <View style={styles.front}>
                <TabListScreen
                  pages={pages}
                  activeId={activeId}
                  onBack={() => setListing(false)}
                  onActivate={activate}
                  onDelete={removePage}
                />
              </View>
            ) : null}
          </View>
          </ShellRoot>
        ) : (
          <SplashScreen />
        )}
      </TextScaleRoot>
      </ThemeRoot>
      </LocaleRoot>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  front: {
    ...StyleSheet.absoluteFill,
  },
  hidden: {
    ...StyleSheet.absoluteFill,
    opacity: 0,
  },
});
