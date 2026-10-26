import {StyleSheet, Text, View} from 'react-native';
import {useLocale} from '../../../shared/i18n/i18n';
import {useTheme} from '../../../shared/settings/theme';
import type {VerifyRow, VerifySide} from '../shared/transfer';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type VerifyTableProps = {
  rows: VerifyRow[];
};

export function VerifyTable({rows}: VerifyTableProps) {
  const styles = useScaledStyles(baseStyles);
  const {ink, inkQuiet, hair, dangerBg} = useTheme();
  const {t} = useLocale();
  return (
    <View>
      <View style={[styles.head, hair]}>
        <Text style={[styles.name, inkQuiet]} />
        <Text style={[styles.side, inkQuiet]}>{t('data_transfer.cloudColumn')}</Text>
        <Text style={[styles.side, inkQuiet]}>{t('data_transfer.fileColumn')}</Text>
      </View>
      <View style={[styles.caption, hair]}>
        <Text style={[styles.captionText, inkQuiet]}>{t('data_transfer.verifyCaption')}</Text>
      </View>
      {rows.map(row => {
        const hasDiff = (row.cloud?.only ?? 0) > 0 || (row.file?.only ?? 0) > 0;
        return (
          <View key={row.collectionId} style={[styles.row, hair, hasDiff ? dangerBg : null]}>
            <Text style={[styles.total, ink, styles.name]}>{row.collectionId}</Text>
            <SideCell side={row.cloud} />
            <SideCell side={row.file} />
          </View>
        );
      })}
      <Text style={[styles.note, inkQuiet]}>{t('data_transfer.cloudCountNote')}</Text>
    </View>
  );
}

function SideCell({side}: {side: VerifySide | null}) {
  const styles = useScaledStyles(baseStyles);
  const {ink, inkQuiet} = useTheme();
  if (!side) {
    return <View style={styles.side} />;
  }
  return (
    <View style={styles.side}>
      <Text style={[styles.total, ink]}>{side.total}</Text>
      {side.only > 0 ? <Text style={[styles.only, inkQuiet]}>{side.only}</Text> : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 8,
  },
  caption: {
    paddingBottom: 8,
  },
  captionText: {
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  name: {
    flex: 1.2,
    paddingRight: 8,
  },
  side: {
    flex: 1,
  },
  total: {
    fontSize: 15,
  },
  only: {
    marginTop: 2,
    fontSize: 11,
  },
  note: {
    marginTop: 8,
    fontSize: 11,
  },
});
