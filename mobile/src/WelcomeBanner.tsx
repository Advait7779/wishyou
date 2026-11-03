import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
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
      <View style={styles.headings}>
        <Text style={styles.title}>Celebrate the little things.</Text>
        <Text style={styles.special}>They become the big things.</Text>
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.description}>Keep every birthday and anniversary close, and every message heartfelt.</Text>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.illustration}>
          <View style={styles.haloOuter} /><View style={styles.haloInner} />
          <View style={styles.mainOrb}><BannerSymbol name="confetti" size={56} /></View>
          <View style={styles.heartOrb}><BannerSymbol name="heart" size={21} color="#f2763a" /></View>
          <View style={styles.cake}><BannerSymbol name="cake" size={26} /></View>
        </View>
      </View>
    </View>
  </LinearGradient>;
}

const styles = StyleSheet.create({
  banner: { minHeight: 280, borderRadius: 19, overflow: 'hidden', paddingHorizontal: 22, paddingVertical: 28 },
  content: { gap: 14 },
  eyebrow: { color: '#ffe3ce', fontSize: 10, lineHeight: 14, letterSpacing: 1.5, fontWeight: '800' },
  headings: { gap: 3 },
  title: { color: '#fff', fontSize: 27, lineHeight: 33, fontWeight: '700', letterSpacing: -.65 },
  special: { color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', fontWeight: '700', fontSize: 27, lineHeight: 34, letterSpacing: -.55 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  description: { flex: 1, minWidth: 0, color: '#fff5ed', fontSize: 13, lineHeight: 20 },
  outerRing: { position: 'absolute', width: 390, height: 390, borderRadius: 195, borderWidth: 1, borderColor: '#ffffff33', top: -240, right: -110 },
  innerRing: { position: 'absolute', width: 285, height: 285, borderRadius: 143, borderWidth: 1, borderColor: '#ffffff33', top: -182, right: -57 },
  illustration: { width: 118, height: 110, flexShrink: 0 },
  haloOuter: { position: 'absolute', width: 182, height: 182, borderRadius: 91, backgroundColor: '#ffffff0d', top: -28, right: -39 },
  haloInner: { position: 'absolute', width: 144, height: 144, borderRadius: 72, backgroundColor: '#ffffff12', top: -9, right: -20 },
  mainOrb: { position: 'absolute', width: 104, height: 104, borderRadius: 52, backgroundColor: '#ffffff29', right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-18deg' }] },
  heartOrb: { position: 'absolute', width: 38, height: 38, borderRadius: 19, left: -4, top: -4, backgroundColor: '#ffcf9c', alignItems: 'center', justifyContent: 'center' },
  cake: { position: 'absolute', top: -10, right: -2 },
});
