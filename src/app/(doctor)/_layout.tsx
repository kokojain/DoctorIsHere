import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { type ColorValue } from 'react-native';

import { BeaconProvider } from '@/lib/beacon-context';
import { palette } from '@/lib/ui';

function TabIcon({ name, color }: { name: SFSymbol; color: ColorValue }) {
  return <SymbolView name={name} tintColor={color as string} style={{ width: 26, height: 26 }} />;
}

export default function DoctorLayout() {
  return (
    <BeaconProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: palette.primary,
          headerShown: true,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'My Presence',
            headerShown: false,
            tabBarIcon: ({ color }) => <TabIcon name="location.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="places"
          options={{
            title: 'My Places',
            tabBarIcon: ({ color }) => <TabIcon name="mappin.and.ellipse" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <TabIcon name="person.fill" color={color} />,
          }}
        />
      </Tabs>
    </BeaconProvider>
  );
}
