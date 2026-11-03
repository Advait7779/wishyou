import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import iconPaths from './banner-icons.json';

// Phosphor icon paths match the web banner. MIT license: assets/phosphor-icons-LICENSE.txt.
type SymbolName = 'confetti' | 'heart' | 'cake';
const paths: Record<SymbolName, { d: string; opacity?: number }[]> = iconPaths;
function BannerSymbol({ name, size, color = '#fff' }: { name: SymbolName; size: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 256 256" fill={color}>{paths[name].map((path, index) => <Path key={index} d={path.d} opacity={path.opacity ?? 1} />)}</Svg>;
}

export function WelcomeBanner() {
  return <LinearGradient colors={['#f17739', '#f9924c', '#fcb779']} locations={[0, .55, 1]} start={{ x: 0, y: .1 }} end={{ x: 1, y: .8 }} style={styles.banner}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={styles.outerRing} /><View style={styles.innerRing} />
    </View>
    <View style={styles.content}>
      <Text style={styles.eyebrow}>YOUR WISHING SPACE</Text>
      <Text style={styles.title}>Celebrate the little things.</Text>
      <View style={styles.bottomRow}>
        <Text style={styles.description}>Keep every birthday and anniversary close, and every message heartfelt.</Text>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.illustration}>
          <View style={styles.haloOuter} /><View style={styles.haloInner} />
          <View style={styles.mainOrb}><BannerSymbol name="confetti" size={40} /></View>
          <View style={styles.heartOrb}><BannerSymbol name="heart" size={16} color="#f2763a" /></View>
          <View style={styles.cake}><BannerSymbol name="cake" size={20} /></View>
        </View>
      </View>
    </View>
  </LinearGradient>;
}

const styles = StyleSheet.create({
  banner: { minHeight: 210, borderRadius: 19, overflow: 'hidden', paddingHorizontal: 20, paddingVertical: 20 },
  content: { gap: 10 },
  eyebrow: { color: '#ffe3ce', fontSize: 10, lineHeight: 14, letterSpacing: 1.5, fontWeight: '800' },
  title: { color: '#fff', fontSize: 27, lineHeight: 33, fontWeight: '700', letterSpacing: -.65 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  description: { flex: 1, minWidth: 0, color: '#fff5ed', fontSize: 13, lineHeight: 20 },
  outerRing: { position: 'absolute', width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: '#ffffff33', top: -170, right: -80 },
  innerRing: { position: 'absolute', width: 205, height: 205, borderRadius: 103, borderWidth: 1, borderColor: '#ffffff33', top: -127, right: -44 },
  illustration: { width: 90, height: 80, flexShrink: 0 },
  haloOuter: { position: 'absolute', width: 136, height: 136, borderRadius: 68, backgroundColor: '#ffffff0d', top: -20, right: -30 },
  haloInner: { position: 'absolute', width: 108, height: 108, borderRadius: 54, backgroundColor: '#ffffff12', top: -6, right: -16 },
  mainOrb: { position: 'absolute', width: 76, height: 76, borderRadius: 38, backgroundColor: '#ffffff29', right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-18deg' }] },
  heartOrb: { position: 'absolute', width: 28, height: 28, borderRadius: 14, left: -2, top: -2, backgroundColor: '#ffcf9c', alignItems: 'center', justifyContent: 'center' },
  cake: { position: 'absolute', top: -8, right: -2 },
});
