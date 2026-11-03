import React from 'react';
import { useIsFocused } from 'expo-router';
import { useSession } from '../../Session';
import { Contacts } from '../../Contacts';
import { Fade } from '../../ui';
export default function ContactsRoute() { const { tick } = useSession(); const focused = useIsFocused(); return focused ? <Fade><Contacts tick={tick} /></Fade> : null; }
