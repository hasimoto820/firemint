import {StyleSheet, Text, View} from 'react-native';
import {useLocale} from '../../../shared/i18n/i18n';
import {useTheme} from '../../../shared/settings/theme';
import type {QuickVerifyRow} from '../shared/transfer';
import {useScaledStyles} from '../../../shared/settings/text_scale';

type QuickVerifyTableProps = {
  rows: QuickVerifyRow[];
};

export function QuickVerifyTable({rows}: QuickVerifyTableProps) {
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
      {rows.map(row => {
        const hasDiff =
          row.cloud == null || row.file == null || row.cloud !== row.file;
        return (
          <View
            key={row.collectionId}
            style={[styles.row, hair, hasDiff ? dangerBg : null]}>
            <Text style={[styles.name, ink]}>{row.collectionId}</Text>
            <Text style={[styles.side, ink]}>{row.cloud ?? ''}</Text>
            <Text style={[styles.side, ink]}>{row.file ?? ''}</Text>
          </View>
        );
      })}
      <Text style={[styles.note, inkQuiet]}>{t('data_transfer.cloudCountNote')}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  name: {
    flex: 1.2,
    fontSize: 15,
    paddingRight: 8,
  },
  side: {
    flex: 1,
    fontSize: 15,
  },
  note: {
    marginTop: 8,
    fontSize: 11,
  },
});
