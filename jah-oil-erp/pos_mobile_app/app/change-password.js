import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import AuthShell from "../components/auth/AuthShell";
import AuthTextInput from "../components/auth/AuthTextInput";
import PrimaryButton from "../components/ui/PrimaryButton";
import { useAuth } from "../features/auth/AuthProvider";
import { getUserFacingErrorMessage } from "../features/errors/messages";
import { useThemedStyles } from "../theme/ThemeProvider";

export default function ChangePasswordScreen() {
  const styles = useThemedStyles(createStyles);
  const { session, completePasswordChange } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session) {
      router.replace("/login");
      return;
    }

    if (!session.mustChangePassword) {
      router.replace("/pos");
    }
  }, [session]);

  async function handleSave() {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await completePasswordChange({ password, confirmPassword });
      router.replace("/pos");
    } catch (error) {
      setErrorMessage(
        getUserFacingErrorMessage(error, { context: "change_password" }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Password Change"
      title="Update your temporary password"
      description="This matches the web ERP workflow. You must set a new password before using the mobile POS."
    >
      <View style={styles.form}>
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
        <AuthTextInput
          label="New password"
          placeholder="Minimum 8 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <AuthTextInput
          label="Confirm password"
          placeholder="Repeat your new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
        <PrimaryButton
          label={isSubmitting ? "Saving..." : "Save Password"}
          onPress={handleSave}
          disabled={isSubmitting}
          helperText="Once saved, you can continue directly to the POS."
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
  });
