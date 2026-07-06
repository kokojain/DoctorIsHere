import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import '@/lib/geofence'; // registers the GPS-checkout background task at startup

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootNavigator() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();
    const group = segments[0];
    if (!session) {
      if (group !== '(auth)') router.replace('/sign-in');
      return;
    }
    if (!profile) return;
    const target = profile.role === 'doctor' ? '(doctor)' : '(patient)';
    if (group !== target) {
      router.replace(profile.role === 'doctor' ? '/(doctor)' : '/(patient)');
    }
  }, [loading, session, profile, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(doctor)" />
      <Stack.Screen name="(patient)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}
