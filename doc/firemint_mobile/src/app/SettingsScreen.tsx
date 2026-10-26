import {useEffect, useState} from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {LOCALE_OPTIONS, useLocale} from '../shared/i18n/i18n';
import {ScreenFrame} from '../shared/shell/chrome';
import {getAppVersion} from '../shared/settings/native';
import {
  TEXT_SCALE_OPTIONS,
  nearestTextScaleStep,
  useScaledStyles,
  useTextScale,
} from '../shared/settings/text_scale';
import {
  COLOR1_OPTIONS,
  COLOR2_OPTIONS,
  useTheme,
  type Color1,
  type Color2,
} from '../shared/settings/theme';

type SettingsScreenProps = {
  onBack: () => void;
};

type Sub = 'theme' | 'language' | 'textSize' | null;

const HOSTING_BASE = 'https://firemint-e801f.web.app';
const CONTACT_MAIL = 'mailto:carepanda886@gmail.com';

export function SettingsScreen({onBack}: SettingsScreenProps) {
  const {
    line,
    frame,
    color2,
    ink,
    inkQuiet,
    fill,
    inkOnFill,
    choice,
    setChoice,
  } = useTheme();
  const {locale, setLocale, t} = useLocale();
  const {scale, setScale} = useTextScale();
  const styles = useScaledStyles(baseStyles);
  const [sub, setSub] = useState<Sub>(null);
  const [versionText, setVersionText] = useState('');

  useEffect(() => {
    getAppVersion().then(info => {
      if (!info.versionName) {
        setVersionText('');
        return;
      }
      setVersionText(
        info.versionCode > 0
          ? `${info.versionName} (${info.versionCode})`
          : info.versionName,
      );
    });
  }, []);

  const themeSummary = `${t(`settings.color1.${choice.color1}`)} · ${t(
    `settings.color2.${choice.color2}`,
  )}`;
  const languageSummary =
    LOCALE_OPTIONS.find(opt => opt.id === locale)?.label ?? '';
  const textStep = nearestTextScaleStep(scale);
  const textSizeSummary = t(`settings.textSize.${textStep}`);

  if (sub === 'theme') {
    return (
      <ScreenFrame title={t('settings.themeLabel')} onBack={() => setSub(null)}>
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={[styles.section, ink]}>{t('settings.color1Label')}</Text>
          <View style={styles.row}>
            {COLOR1_OPTIONS.map(opt => {
              const on = choice.color1 === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.chip, on ? fill : null]}
                  onPress={() =>
                    setChoice({...choice, color1: opt.id as Color1})
                  }>
                  <View
                    style={[
                      styles.swatch,
                      {backgroundColor: opt.hex, borderColor: line},
                    ]}
                  />
                  <Text style={[styles.chipText, on ? inkOnFill : ink]}>
                    {t(`settings.color1.${opt.id}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.section, ink]}>{t('settings.color2Label')}</Text>
          <View style={styles.row}>
            {COLOR2_OPTIONS.map(opt => {
              const on = choice.color2 === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.chip, on ? fill : null]}
                  onPress={() =>
                    setChoice({...choice, color2: opt.id as Color2})
                  }>
                  <View
                    style={[
                      styles.swatch,
                      {backgroundColor: opt.hex, borderColor: line},
                    ]}
                  />
                  <Text style={[styles.chipText, on ? inkOnFill : ink]}>
                    {t(`settings.color2.${opt.id}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </ScreenFrame>
    );
  }

  if (sub === 'language') {
    return (
      <ScreenFrame
        title={t('settings.languageLabel')}
        onBack={() => setSub(null)}>
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.row}>
            {LOCALE_OPTIONS.map(opt => {
              const on = locale === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.chip, on ? fill : null]}
                  onPress={() => setLocale(opt.id)}>
                  <Text style={[styles.chipText, on ? inkOnFill : ink]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </ScreenFrame>
    );
  }

  if (sub === 'textSize') {
    return (
      <ScreenFrame
        title={t('settings.textSizeLabel')}
        onBack={() => setSub(null)}>
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.row}>
            {TEXT_SCALE_OPTIONS.map(opt => {
              const on = opt.scale === scale;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.chip, on ? fill : null]}
                  onPress={() => setScale(opt.scale)}>
                  <Text style={[styles.chipText, on ? inkOnFill : ink]}>
                    {t(`settings.textSize.${opt.id}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </ScreenFrame>
    );
  }

  // 1 行。左に文字、右に印（› は画面の中へ、↗ は外のアプリへ）
  const rowView = (
    label: string,
    onPress: () => void,
    mark: '›' | '↗',
    last?: boolean,
  ) => (
    <Pressable
      style={[
        styles.groupRow,
        last ? null : {borderBottomColor: line},
        last ? null : styles.rowDivider,
      ]}
      onPress={onPress}>
      <Text style={[styles.rowLabel, ink]}>{label}</Text>
      <Text style={[styles.mark, inkQuiet]}>{mark}</Text>
    </Pressable>
  );

  return (
    <ScreenFrame title={t('settings.title')} onBack={onBack}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={[styles.groupLabel, inkQuiet]}>
          {t('settings.themeLabel')}
        </Text>
        <View style={[styles.group, frame, {borderLeftColor: color2}]}>
          {rowView(themeSummary, () => setSub('theme'), '›', true)}
        </View>

        <Text style={[styles.groupLabel, inkQuiet]}>
          {t('settings.languageLabel')}
        </Text>
        <View style={[styles.group, frame, {borderLeftColor: color2}]}>
          {rowView(languageSummary, () => setSub('language'), '›', true)}
        </View>

        <Text style={[styles.groupLabel, inkQuiet]}>
          {t('settings.textSizeLabel')}
        </Text>
        <View style={[styles.group, frame, {borderLeftColor: color2}]}>
          {rowView(textSizeSummary, () => setSub('textSize'), '›', true)}
        </View>

        <Text style={[styles.groupLabel, inkQuiet]}>
          {t('settings.groupSupport')}
        </Text>
        <View style={[styles.group, frame, {borderLeftColor: color2}]}>
          {rowView(
            t('settings.link.howTo'),
            () => Linking.openURL(`${HOSTING_BASE}/`),
            '↗',
          )}
          {rowView(
            t('settings.link.privacy'),
            () => Linking.openURL(`${HOSTING_BASE}/privacy.html`),
            '↗',
          )}
          {rowView(
            t('settings.link.contact'),
            () => Linking.openURL(CONTACT_MAIL),
            '↗',
            true,
          )}
        </View>

        {versionText ? (
          <Text style={[styles.version, inkQuiet]}>FireMint {versionText}</Text>
        ) : null}
      </ScrollView>
    </ScreenFrame>
  );
}

const baseStyles = StyleSheet.create({
  section: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  chip: {
    width: '48%',
    marginRight: '2%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
  },
  chipText: {
    fontSize: 14,
  },
  page: {
    paddingTop: 28,
    paddingBottom: 48,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginLeft: 4,
    marginBottom: 12,
  },
  // 左端の差し色の帯（色は color2）
  group: {
    borderLeftWidth: 4,
    marginBottom: 40,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 16,
  },
  mark: {
    fontSize: 16,
    marginLeft: 12,
  },
  version: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
});
