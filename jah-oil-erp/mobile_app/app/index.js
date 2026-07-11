import { Redirect } from "expo-router";

import AppSplashScreen from "../components/ui/AppSplashScreen";
import { useClientApp } from "../features/client/AppProvider";
import { useAppTheme } from "../theme/ThemeProvider";

export default function Index() {
  const { authStatus, isAuthenticated } = useClientApp();
  const { palette } = useAppTheme();

  if (authStatus === "loading") {
    return <AppSplashScreen palette={palette} />;
  }

  return <Redirect href={isAuthenticated ? "/home" : "/login"} />;
}
