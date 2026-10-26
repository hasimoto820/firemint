import {Image, StyleSheet, View} from 'react-native';

const icon = require('./assets/splash.png');

export function SplashScreen() {
  return (
    <View style={styles.wrap}>
      <Image source={icon} style={styles.icon} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  icon: {
    width: 96,
    height: 96,
  },
});
