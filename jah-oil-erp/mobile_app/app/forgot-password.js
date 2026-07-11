import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import AuthShell from "../components/auth/AuthShell";
import AuthTextInput from "../components/auth/AuthTextInput";
import PrimaryButton from "../components/ui/PrimaryButton";
import { useThemedStyles } from "../theme/ThemeProvider";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const styles = useThemedStyles(createStyles);

  return (
    <AuthShell
      eyebrow="Account Recovery"
      title="Reset your password"
      description="Enter your work email and follow the next recovery step once backend integration is connected."
      footer={
        <Text style={styles.footerText}>
          For now this screen is UI-only and ready for API wiring.
        </Text>
      }
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
        <PrimaryButton
          label="Send Reset Link"
          onPress={() => router.back()}
          helperText="Returns to sign-in until auth backend is connected."
        />
      </View>
    </AuthShell>
  );
}

const createStyles = (palette) => StyleSheet.create({
  form: {
    gap: 16,
  },
  footerText: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: palette.mutedText,
  },
});
