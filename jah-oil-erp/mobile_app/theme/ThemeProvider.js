import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { getPalette } from "./palette";

const ThemeContext = createContext(null);
const THEME_MODE_STORAGE_KEY = "jah_client_theme_mode";

function normalizeThemeMode(value) {
  return value === "light" ? "light" : "dark";
}

async function readStoredThemeMode() {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return normalizeThemeMode(window.localStorage.getItem(THEME_MODE_STORAGE_KEY));
    }

    const storedValue = await SecureStore.getItemAsync(THEME_MODE_STORAGE_KEY);
    return normalizeThemeMode(storedValue);
  } catch {
    return "dark";
  }
}

async function persistThemeMode(mode) {
  const normalizedMode = normalizeThemeMode(mode);

  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, normalizedMode);
      return;
    }

    await SecureStore.setItemAsync(THEME_MODE_STORAGE_KEY, normalizedMode);
  } catch {}
}

export function AppThemeProvider({ children }) {
  const [mode, setMode] = useState("dark");
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    readStoredThemeMode()
      .then((storedMode) => {
        if (!isMounted) {
          return;
        }

        setMode(storedMode);
        setIsThemeReady(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setIsThemeReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isThemeReady) {
      return;
    }

    persistThemeMode(mode);
  }, [isThemeReady, mode]);

  const applyThemeMode = useCallback((nextMode) => {
    setMode(normalizeThemeMode(nextMode));
  }, []);

  const toggleThemeMode = useCallback(() => {
    setMode((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => {
    const palette = getPalette(mode);

    return {
      mode,
      isDark: mode === "dark",
      isThemeReady,
      palette,
      setMode: applyThemeMode,
      toggleMode: toggleThemeMode,
    };
  }, [applyThemeMode, isThemeReady, mode, toggleThemeMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider.");
  }

  return context;
}

export function useThemedStyles(factory) {
  const { palette } = useAppTheme();

  return useMemo(() => factory(palette), [factory, palette]);
}
