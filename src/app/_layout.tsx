import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AppLock } from '@/components/app-lock';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [splashFinished, setSplashFinished] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const handleSplashFinished = useCallback(() => setSplashFinished(true), []);
  const handleUnlock = useCallback(() => setUnlocked(true), []);
  const handleLock = useCallback(() => setUnlocked(false), []);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {unlocked ? <AppTabs /> : null}
      <AnimatedSplashOverlay onFinish={handleSplashFinished} />
      <AppLock locked={!unlocked} splashFinished={splashFinished} onUnlocked={handleUnlock} onLocked={handleLock} />
    </ThemeProvider>
  );
}
