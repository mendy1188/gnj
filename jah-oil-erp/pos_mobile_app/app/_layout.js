import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import PosSplashScreen from "../components/ui/PosSplashScreen";
import { AuthProvider } from "../features/auth/AuthProvider";
import { AppThemeProvider, useAppTheme } from "../theme/ThemeProvider";

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </AppThemeProvider>
  );
}

function RootNavigator() {
  const { isDark, palette } = useAppTheme();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timerId = setTimeout(() => {
      setShowSplash(false);
    }, 1200);

    return () => {
      clearTimeout(timerId);
    };
  }, []);

  if (showSplash) {
    return (
      <>
        <StatusBar style="light" />
        <PosSplashScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: palette.background,
          },
          headerTintColor: palette.text,
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: palette.background,
          },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="change-password"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="pos" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
