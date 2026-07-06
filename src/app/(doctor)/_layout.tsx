import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { BeaconProvider } from '@/lib/beacon-context';
import { palette } from '@/lib/ui';

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function DoctorLayout() {
  return (
    <BeaconProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: palette.primary,
          headerShown: true,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'My Presence',
            tabBarIcon: ({ color }) => <TabIcon glyph="📍" color={color} />,
          }}
        />
        <Tabs.Screen
          name="places"
          options={{
            title: 'My Places',
            tabBarIcon: ({ color }) => <TabIcon glyph="📶" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <TabIcon glyph="👤" color={color} />,
          }}
        />
      </Tabs>
    </BeaconProvider>
  );
}
