import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  changePassword,
  fetchCurrentSession,
  loginWithPassword,
} from "./api";
import secureStorage from "../storage/secure-storage";

const AUTH_STORAGE_KEY = "jah_pos_mobile_auth_v1";

const AuthContext = createContext(null);

async function loadStoredAuthState() {
  try {
    const raw = await secureStorage.getItem(AUTH_STORAGE_KEY);

    if (!raw) {
      return { token: "", session: null };
    }

    const parsed = JSON.parse(raw);

    return {
      token: `${parsed?.token || ""}`.trim(),
      session: parsed?.session || null,
    };
  } catch {
    return { token: "", session: null };
  }
}

async function saveStoredAuthState(state) {
  if (!state?.token || !state?.session) {
    await secureStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  await secureStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      token: state.token,
      session: state.session,
    }),
  );
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState("");
  const [session, setSession] = useState(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      const storedState = await loadStoredAuthState();

      if (!isMounted) {
        return;
      }

      setToken(storedState.token);
      setSession(storedState.session);
      setIsHydrating(false);

      if (storedState.token) {
        try {
          const result = await fetchCurrentSession(storedState.token);

          if (!isMounted) {
            return;
          }

          setSession(result.session || storedState.session);
          await saveStoredAuthState({
            token: storedState.token,
            session: result.session || storedState.session,
          });
        } catch (error) {
          if (error?.status === 401 && isMounted) {
            setToken("");
            setSession(null);
            await saveStoredAuthState(null);
          }
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      token,
      session,
      isHydrating,
      isAuthenticated: Boolean(token && session),
      async signIn({ email, password }) {
        const result = await loginWithPassword({ email, password });
        const nextToken = `${result?.token || ""}`.trim();
        const nextSession = result?.session || null;

        setToken(nextToken);
        setSession(nextSession);
        await saveStoredAuthState({
          token: nextToken,
          session: nextSession,
        });

        return nextSession;
      },
      async refreshSession() {
        if (!token) {
          return null;
        }

        const result = await fetchCurrentSession(token);
        const nextSession = result?.session || null;

        setSession(nextSession);
        await saveStoredAuthState({
          token,
          session: nextSession,
        });

        return nextSession;
      },
      async completePasswordChange({ password, confirmPassword }) {
        if (!token) {
          throw new Error("Missing mobile session token.");
        }

        await changePassword({
          token,
          password,
          confirmPassword,
        });

        const nextSession = {
          ...(session || {}),
          mustChangePassword: false,
        };

        setSession(nextSession);
        await saveStoredAuthState({
          token,
          session: nextSession,
        });
      },
      async signOut() {
        setToken("");
        setSession(null);
        await saveStoredAuthState(null);
      },
    }),
    [isHydrating, session, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
