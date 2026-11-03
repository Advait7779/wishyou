import React from 'react';
import { router, useIsFocused } from 'expo-router';
import { useSession } from '../../Session';
import { Overview } from '../../Screens';
import { Fade } from '../../ui';
export default function OverviewRoute() { const { tick } = useSession(); const focused = useIsFocused(); return focused ? <Fade><Overview tick={tick} onContacts={() => router.navigate('/(tabs)/contacts')} /></Fade> : null; }
