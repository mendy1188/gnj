import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { getPalette } from "./palette";
import storage from "../features/storage/local-storage";

const ThemeContext = createContext(null);
const THEME_STORAGE_KEY = "jah_pos_mobile_theme_v1";

export function AppThemeProvider({ children }) {
  const [mode, setMode] = useState("dark");

  useEffect(() => {
    let isMounted = true;

    async function hydrateMode() {
      const storedMode = await storage.getItem(THEME_STORAGE_KEY);

      if (!isMounted) {
        return;
      }

      if (storedMode === "light" || storedMode === "dark") {
        setMode(storedMode);
      }
    }

    void hydrateMode();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void storage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo(() => {
    const palette = getPalette(mode);

    return {
      mode,
      isDark: mode === "dark",
      palette,
      setMode,
      toggleMode: () => setMode((current) => (current === "dark" ? "light" : "dark")),
    };
  }, [mode]);

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
