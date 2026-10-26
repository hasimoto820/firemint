import {useState} from 'react';
import {ScrollView} from 'react-native';
import {useLocale} from '../../../shared/i18n/i18n';
import {ScreenFrame} from '../../../shared/shell/chrome';
import {FirestoreAccountPanel} from './components/FirestoreAccountPanel';

type ConnectionScreenProps = {
  onBack: () => void;
};

// 認証画面。firestoreアカウントの確認・切り替え・サインアウトだけ。
// プロジェクト一覧は置かない（ホームの「プロジェクト一覧」から開く）。
export function ConnectionScreen({onBack}: ConnectionScreenProps) {
  const {t} = useLocale();
  const [busy, setBusy] = useState(false);
  return (
    <ScreenFrame title={t('home.card.auth')} onBack={onBack}>
      <ScrollView>
        <FirestoreAccountPanel busy={busy} onBusy={setBusy} onSignedOut={onBack} />
      </ScrollView>
    </ScreenFrame>
  );
}
