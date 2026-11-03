import React, { PropsWithChildren, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, ColorValue, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

export const c = { bg: '#fffaf5', orange: '#f17235', ink: '#2c241d', muted: '#928276', border: '#f0e4d9', soft: '#fff0e5', red: '#d94e43', green: '#099b83' };
export type IconName = React.ComponentProps<typeof Feather>['name'];
export function Icon({ name, color = c.orange, size = 19 }: { name: IconName; color?: ColorValue; size?: number }) { return <Feather name={name} color={color} size={size} />; }
export function Button({ title, onPress, icon, soft, danger, disabled, busy, compact }: { title: string; onPress: () => void; icon?: IconName; soft?: boolean; danger?: boolean; disabled?: boolean; busy?: boolean; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || busy} onPress={onPress}
    hitSlop={compact ? { top: 4, bottom: 4 } : undefined}
    style={({ pressed }) => [s.button, compact && { flex: 1, minWidth: 0, minHeight: 36, paddingHorizontal: 6, paddingVertical: 9, gap: 4, borderRadius: 8 }, { backgroundColor: danger ? c.red : soft ? c.soft : c.orange }, (disabled || busy) && { opacity: .5 }, pressed && { opacity: .8, transform: [{ scale: .98 }] }]}>
    {busy ? <ActivityIndicator size="small" color={soft ? c.orange : '#fff'} /> : icon && <Icon name={icon} color={soft ? c.orange : '#fff'} size={compact ? 14 : 17} />}
    <Text numberOfLines={compact ? 1 : undefined} adjustsFontSizeToFit={compact} minimumFontScale={0.85} style={[s.buttonText, compact && { fontSize: 10, flexShrink: 1 }, soft && { color: c.orange }]}>{title}</Text>
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) { return <View style={{ gap: 8 }}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#b6a698" {...props} style={[s.input, props.style]} /></View>; }
export function Heading({ eyebrow, title, sub, compact }: { eyebrow: string; title: string; sub?: string; compact?: boolean }) { return <View style={{ gap: compact ? 4 : 7, marginBottom: compact ? 0 : 6 }}><Text style={[s.eyebrow, compact && { fontSize: 9, letterSpacing: 1.3 }]}>{eyebrow}</Text><Text style={[s.heading, compact && { fontSize: 22, lineHeight: 27 }]}>{title}</Text>{sub && <Text style={[s.copy, compact && { fontSize: 11, lineHeight: 16 }]}>{sub}</Text>}</View>; }
export function Card({ children, compact }: PropsWithChildren<{ compact?: boolean }>) { return <View style={[s.card, compact && { padding: 16, gap: 12, borderRadius: 16 }]}>{children}</View>; }
export function Notice({ text, error }: { text: string; error?: boolean }) { return text ? <Text accessibilityLiveRegion="polite" style={[s.notice, error && { color: c.red, backgroundColor: '#fff0ee' }]}>{text}</Text> : null; }
export function Fade({ children }: PropsWithChildren) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => { let mounted = true; AccessibilityInfo.isReduceMotionEnabled().then(reduced => { if (!mounted || reduced) return; opacity.setValue(0); Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(); }); return () => { mounted = false; }; }, [opacity]);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}
export function Dialog({ title, children, onClose, busy, compact, icon }: PropsWithChildren<{ title: string; onClose: () => void; busy?: boolean; compact?: boolean; icon?: IconName }>) {
  const insets = useSafeAreaInsets();
  return <Modal visible transparent animationType="none" onRequestClose={() => !busy && onClose()}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[s.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
    <Reanimated.View entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)} accessibilityViewIsModal style={[s.dialog, compact && { width: '100%', maxWidth: 320, alignSelf: 'center', borderRadius: 16, padding: 16, gap: 10 }]}>
      <View style={[s.dialogHeader, compact && { gap: 9 }]}>
        {icon && <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={15} /></View>}
        <Text style={[s.dialogTitle, compact && { fontSize: 17, fontWeight: '600' }]}>{title}</Text>
        <Pressable onPress={onClose} disabled={busy} accessibilityLabel="Close dialog" hitSlop={compact ? 6 : undefined} style={[s.iconButton, compact && { minWidth: 32, minHeight: 32, borderRadius: 8 }]}><Icon name="x" size={compact ? 16 : 19} /></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: compact ? 12 : 16, paddingBottom: compact ? 0 : 6 }}>{children}</ScrollView>
    </Reanimated.View>
  </KeyboardAvoidingView></Modal>;
}
export function Choice({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <View style={s.choices}>{options.map(option => <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="radio" accessibilityState={{ selected: value === option.value }} style={[s.choice, value === option.value && { backgroundColor: c.soft, borderColor: c.orange }]}><Text style={{ color: value === option.value ? c.orange : c.muted, fontWeight: '600' }}>{option.label}</Text></Pressable>)}</View>;
}
export const s = StyleSheet.create({
  page: { padding: 20, gap: 20, paddingBottom: 32 }, card: { borderWidth: 1, borderColor: c.border, borderRadius: 20, backgroundColor: '#fff', padding: 20, gap: 16 },
  heading: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', fontSize: 29, color: c.ink }, eyebrow: { color: c.orange, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  copy: { color: c.muted, fontSize: 13, lineHeight: 21 }, label: { color: '#5a4a3d', fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#e9d9cc', backgroundColor: '#fffcfa', borderRadius: 11, paddingHorizontal: 14, minHeight: 49, fontSize: 14, color: c.ink },
  button: { minHeight: 46, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.soft },
  notice: { color: '#a66135', backgroundColor: c.soft, borderRadius: 10, padding: 13, lineHeight: 21, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: '#2c241d88', justifyContent: 'center', paddingHorizontal: 16 }, dialog: { backgroundColor: '#fff', borderRadius: 22, padding: 20, maxHeight: '95%', gap: 12 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, dialogTitle: { color: c.ink, fontSize: 20, flex: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { borderRadius: 10, padding: 12, borderWidth: 1, borderColor: c.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
});
