import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import AppSplashScreen from "../components/ui/AppSplashScreen";
import { ClientAppProvider } from "../features/client/AppProvider";
import { useClientApp } from "../features/client/AppProvider";
import { AppThemeProvider, useAppTheme } from "../theme/ThemeProvider";

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <ClientAppProvider>
        <RootNavigator />
      </ClientAppProvider>
    </AppThemeProvider>
  );
}

function RootNavigator() {
  const { isDark, palette } = useAppTheme();
  const { authStatus } = useClientApp();

  if (authStatus === "loading") {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <AppSplashScreen palette={palette} />
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
          headerTitleStyle: {
            fontWeight: "700",
          },
          contentStyle: {
            backgroundColor: palette.background,
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="login"
          options={{
            title: "Sign In",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{
            title: "Forgot Password",
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="signup"
          options={{
            title: "Create Account",
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="home"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}
