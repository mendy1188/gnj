import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";

import AuthShell from "../components/auth/AuthShell";
import AuthTextInput from "../components/auth/AuthTextInput";
import PrimaryButton from "../components/ui/PrimaryButton";
import { useClientApp } from "../features/client/AppProvider";
import { useThemedStyles } from "../theme/ThemeProvider";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const { authStatus, isAuthenticated, signIn } = useClientApp();
  const styles = useThemedStyles(createStyles);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/home");
    }
  }, [isAuthenticated]);

  async function handleSignIn() {
    setFeedback("");
    setIsSubmitting(true);

    try {
      await signIn({ email, password });
      router.replace("/home");
    } catch (error) {
      setFeedback(error?.message || "We could not sign you in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Jah Multi Industries"
      title="Jah Client App"
      description="Sign in to access fuel purchase, cash back, and more."
      // footer={
      //   <Text style={styles.footerText}>
      //     Need admin support? Contact your station or support administrator.
      //   </Text>
      // }
    >
      <View style={styles.form}>
        <AuthTextInput
          label="Email address"
          placeholder="Enter your email"
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
        <Link href="/forgot-password" asChild>
          <Pressable style={styles.inlineLinkWrap}>
            <Text style={styles.inlineLink}>Forgot password?</Text>
          </Pressable>
        </Link>
        <Link href="/signup" asChild>
          <Pressable style={styles.inlineLinkWrap}>
            <Text style={styles.inlineLink}>Create account</Text>
          </Pressable>
        </Link>
        <PrimaryButton
          label={isSubmitting ? "Signing in..." : "Sign In"}
          onPress={handleSignIn}
          disabled={isSubmitting || authStatus === "loading"}
        />
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      </View>
    </AuthShell>
  );
}

const createStyles = (palette) => StyleSheet.create({
  form: {
    gap: 16,
  },
  inlineLinkWrap: {
    alignSelf: "flex-end",
  },
  inlineLink: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.primary,
  },
  footerText: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: palette.mutedText,
  },
  feedback: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.warning,
  },
});
