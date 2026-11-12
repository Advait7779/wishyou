import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../Session';
import { SignIn } from '../Screens';
import { c } from '../ui';

export default function LoginRoute() {
  const { email, boot, setEmail } = useSession();
  if (boot) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.orange} /></View>;
  if (email) return <Redirect href="/(tabs)" />;
  return <View style={styles.screen}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#fff0e1', '#fffdfb', '#fff3e7']} locations={[0, .48, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['#f9ad75', '#ffe1c5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.topGlow} />
      <View style={styles.topRing} /><View style={styles.topInnerRing} />
      <LinearGradient colors={['#ffe2c9', '#f6a26b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bottomGlow} />
      <View style={styles.bottomRing} /><View style={styles.whiteOrb} />
      <View style={[styles.dot, styles.dotTop]} /><View style={[styles.dot, styles.dotBottom]} />
    </View>
    <SafeAreaView style={styles.safeArea}><SignIn onLogin={setEmail} /></SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden', backgroundColor: '#fffaf5' },
  safeArea: { flex: 1 },
  topGlow: { position: 'absolute', width: 340, height: 340, borderRadius: 170, top: -170, left: -135 },
  topRing: { position: 'absolute', width: 330, height: 330, borderRadius: 165, top: -135, left: -100, borderWidth: 1, borderColor: '#ed9a6338' },
  topInnerRing: { position: 'absolute', width: 250, height: 250, borderRadius: 125, top: -95, left: -60, borderWidth: 1, borderColor: '#ffffff90' },
  bottomGlow: { position: 'absolute', width: 370, height: 370, borderRadius: 185, bottom: -195, right: -145 },
  bottomRing: { position: 'absolute', width: 330, height: 330, borderRadius: 165, bottom: -135, right: -100, borderWidth: 1, borderColor: '#efab773d' },
  whiteOrb: { position: 'absolute', width: 160, height: 160, borderRadius: 80, bottom: -60, right: 90, backgroundColor: '#ffffff75' },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#edaa774a' },
  dotTop: { top: '13%', right: '16%' },
  dotBottom: { bottom: '16%', left: '12%', width: 5, height: 5 },
});
