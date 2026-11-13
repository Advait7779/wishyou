import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL, login } from './api';
import { Button, c, Icon, s } from './ui';

export function SignIn({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const { width } = useWindowDimensions();
  const landscape = width >= 740;

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  async function submit() {
    if (!email.trim() || !password || busy) return;
    setBusy(true); setError('');
    try {
      const signedInEmail = await login(email, password);
      setPassword(''); Keyboard.dismiss(); onLogin(signedInEmail);
    } catch (cause: any) { setError(cause.message); }
    finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={[styles.screen, keyboardOpen && styles.screenTyping]}>
      <View style={[styles.card, landscape && styles.cardLandscape]}>
        <LinearGradient colors={['#e96d32', '#f9a463']} style={[styles.hero, landscape && styles.heroLandscape]}>
          <View pointerEvents="none" accessible={false} style={styles.ring} />
          <View style={styles.brand}><View style={styles.mark}><Icon name="gift" color="#fff" size={21} /></View><Text style={styles.brandText}>wishyou.com</Text></View>
          <Text style={styles.eyebrow}>A LITTLE JOY, RIGHT ON TIME</Text>
          <Text style={styles.heroTitle}>Make every{'\n'}moment count.</Text>
        </LinearGradient>
        <View style={[styles.form, landscape && styles.formLandscape]}>
          <Text style={styles.title}>Welcome back</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Email address</Text>
            <TextInput accessibilityLabel="Email address" value={email} onChangeText={setEmail} keyboardType="email-address"
              autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@company.com"
              placeholderTextColor="#b6a698" editable={!busy} returnKeyType="next" submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()} style={[s.input, styles.input]} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View>
              <TextInput ref={passwordRef} accessibilityLabel="Password" value={password} onChangeText={setPassword}
                secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="current-password"
                placeholder="Enter your password" placeholderTextColor="#b6a698" editable={!busy} returnKeyType="go"
                onSubmitEditing={submit} style={[s.input, styles.input, styles.password]} />
              <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}
                onPress={() => setVisible(value => !value)} style={styles.visibility}><Icon name={visible ? 'eye-off' : 'eye'} color={c.muted} size={18} /></Pressable>
            </View>
          </View>
          {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
          <Button title="Sign in" icon="arrow-right" onPress={submit} busy={busy} disabled={!email.trim() || !password} />
          <View style={styles.secure}><Icon name="shield" color={c.muted} size={13} /><Text style={styles.secureText}>Secure admin access</Text></View>
        </View>
      </View>
      {__DEV__ && !keyboardOpen && <Text selectable numberOfLines={1} style={styles.development}>Development API: {API_URL || 'not configured'}</Text>}
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  screenTyping: { justifyContent: 'flex-end' },
  card: { width: '100%', maxWidth: 470, flexShrink: 0, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: '#fff' },
  cardLandscape: { flexDirection: 'row', maxWidth: 800 },
  hero: { paddingHorizontal: 24, paddingVertical: 14, gap: 6, overflow: 'hidden' },
  heroLandscape: { width: '40%', justifyContent: 'center' },
  ring: { position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 1, borderColor: '#ffffff30', top: -110, right: -90 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#ffffff33', alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -1 },
  eyebrow: { color: '#ffe2ca', fontSize: 9, lineHeight: 12, letterSpacing: 1.25, fontWeight: '800' },
  heroTitle: { color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', fontSize: 26, lineHeight: 28 },
  form: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, gap: 8 },
  formLandscape: { flex: 1, minWidth: 0 },
  title: { color: c.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', fontSize: 25, lineHeight: 28 },
  field: { gap: 4 },
  label: { color: '#5a4a3d', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  input: { minHeight: 42, paddingVertical: 8, fontSize: 13 },
  password: { paddingRight: 48 },
  visibility: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 46, alignItems: 'center', justifyContent: 'center' },
  error: { color: c.red, backgroundColor: '#fff0ee', borderRadius: 8, padding: 9, fontSize: 11, lineHeight: 16 },
  secure: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  secureText: { color: c.muted, fontSize: 10, lineHeight: 14 },
  development: { color: c.muted, fontSize: 9, marginTop: 10, maxWidth: 470, width: '100%', textAlign: 'center' },
});
