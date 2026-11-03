import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../Session';
import { logout } from '../../api';
import { c, Icon, s } from '../../ui';
import { t } from '../../Screens';

export default function TabLayout() {
  const { email, boot, setEmail } = useSession();
  if (boot) return null;
  if (!email) return <Redirect href="/" />;
  async function signOut() { try { await logout(); } catch {} finally { setEmail(null); } }
  return <Tabs screenOptions={{ sceneStyle: { backgroundColor: c.bg }, tabBarActiveTintColor: c.orange, tabBarInactiveTintColor: c.muted,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }, tabBarStyle: { backgroundColor: '#fff', borderTopColor: c.border },
    header: () => <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff' }}><View style={{ padding: 16, borderBottomColor: c.border, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><View style={t.brand}><View style={[t.mark, { width: 36, height: 36, backgroundColor: c.orange }]}><Icon name="gift" color="#fff" /></View><Text style={t.brandText}>wishyou.com</Text></View><Pressable accessibilityLabel="Sign out" style={s.iconButton} onPress={() => Alert.alert('Sign out?', 'You can sign in again anytime.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: signOut }])}><Icon name="log-out" /></Pressable></View></SafeAreaView>,
  }}><Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: ({ color }) => <Icon name="home" color={color} /> }} /><Tabs.Screen name="contacts" options={{ title: 'Contacts', tabBarIcon: ({ color }) => <Icon name="users" color={color} /> }} /><Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: ({ color }) => <Icon name="clock" color={color} /> }} /></Tabs>;
}
