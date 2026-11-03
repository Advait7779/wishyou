import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../Session';
import { c } from '../ui';

export default function Layout() {
  return <SafeAreaProvider><SessionProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'fade' }}><Stack.Screen name="index" /><Stack.Screen name="(tabs)" /></Stack></SessionProvider></SafeAreaProvider>;
}
