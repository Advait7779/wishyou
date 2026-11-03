import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../Session';
import { SignIn } from '../Screens';
import { c } from '../ui';

export default function LoginRoute() {
  const { email, boot, setEmail } = useSession();
  if (boot) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.orange} /></View>;
  if (email) return <Redirect href="/(tabs)" />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}><SignIn onLogin={setEmail} /></SafeAreaView>;
}
