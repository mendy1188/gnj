import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import AuthShell from "../components/auth/AuthShell";
import AuthTextInput from "../components/auth/AuthTextInput";
import PrimaryButton from "../components/ui/PrimaryButton";
import { useAuth } from "../features/auth/AuthProvider";
import { getUserFacingErrorMessage } from "../features/errors/messages";
import { useThemedStyles } from "../theme/ThemeProvider";

const DEMO_EMAIL = "admin@jahoil.com";
const DEMO_PASSWORD = "password";

export default function LoginScreen() {
  const styles = useThemedStyles(createStyles);
  const { signIn, signOut, isAuthenticated, session } = useAuth();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (session?.mustChangePassword) {
      router.replace("/change-password");
      return;
    }

    router.replace("/pos");
  }, [isAuthenticated, session]);

  async function handleSignIn() {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const nextSession = await signIn({ email, password });

      if (!nextSession?.modules?.includes("pos")) {
        await signOut();
        setErrorMessage("This account does not have access to the POS module.");
        return;
      }

      if (nextSession.mustChangePassword) {
        router.replace("/change-password");
        return;
      }

      router.replace("/pos");
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error, { context: "login" }));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Jah Oil POS"
      title="Sign in to the mobile POS"
      description="Use the same user account and branch permissions configured from the web admin panel."
      footer={
        <Text style={styles.footerText}>
          Default demo credentials: {DEMO_EMAIL} / {DEMO_PASSWORD}
        </Text>
      }
    >
      <View style={styles.form}>
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
        <AuthTextInput
          label="Email address"
          placeholder="name@jahoil.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <AuthTextInput
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <PrimaryButton
          label={isSubmitting ? "Signing In..." : "Sign In"}
          onPress={handleSignIn}
          disabled={isSubmitting}
          helperText="This mobile POS uses the same credential and role checks as the web ERP."
        />
      </View>
    </AuthShell>
  );
}

const createStyles = (palette) =>
  StyleSheet.create({
    form: {
      gap: 16,
    },
    errorBanner: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "#fecdd3",
      backgroundColor: palette.mode === "dark" ? "#3f0d1b" : "#fff1f2",
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    errorText: {
      fontSize: 13,
      lineHeight: 19,
      color: palette.mode === "dark" ? "#fecdd3" : "#be123c",
    },
    footerText: {
      textAlign: "center",
      fontSize: 12,
      lineHeight: 18,
      color: palette.mutedText,
    },
  });
