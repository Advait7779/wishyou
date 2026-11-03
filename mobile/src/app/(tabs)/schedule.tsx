import React from 'react';
import { useIsFocused } from 'expo-router';
import { useSession } from '../../Session';
import { Schedule } from '../../Screens';
import { Fade } from '../../ui';
export default function ScheduleRoute() { const { tick } = useSession(); const focused = useIsFocused(); return focused ? <Fade><Schedule tick={tick} /></Fade> : null; }
