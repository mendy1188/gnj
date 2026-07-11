import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";

import AuthShell from "../components/auth/AuthShell";
import AuthTextInput from "../components/auth/AuthTextInput";
import PrimaryButton from "../components/ui/PrimaryButton";
import { useClientApp } from "../features/client/AppProvider";
import { useThemedStyles } from "../theme/ThemeProvider";

const USER_TYPE_OPTIONS = [
  { value: "individual", label: "Individual" },
  { value: "company", label: "Company / Organization" },
];

export default function SignupScreen() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    userType: "individual",
    companyName: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pauseAuthenticatedRedirect, setPauseAuthenticatedRedirect] = useState(false);
  const { isAuthenticated, signUp } = useClientApp();
  const styles = useThemedStyles(createStyles);

  useEffect(() => {
    if (isAuthenticated && !pauseAuthenticatedRedirect) {
      router.replace("/home");
    }
  }, [isAuthenticated, pauseAuthenticatedRedirect]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSignUp() {
    setFeedback("");

    if (form.password !== form.confirmPassword) {
      setFeedback("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setPauseAuthenticatedRedirect(true);

    try {
      await signUp({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        userType: form.userType,
        companyName: form.companyName,
      });
      Alert.alert(
        "Account created",
        "Your account is ready. Go to Settings to add your payment method and mobile money numbers.",
        [
          {
            text: "Continue",
            onPress: () => router.replace("/home"),
          },
        ],
      );
    } catch (error) {
      setPauseAuthenticatedRedirect(false);
      setFeedback(error?.message || "We could not create your account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Jah Multi Industries"
      title="Jah Client App"
      description="Register as an individual or company  to access fuel purchases, cash back, bulk fuel, and more."
      footer={
        <Text style={styles.footerText}>
          Already have an account?{" "}
          <Link href="/login" style={styles.footerLink}>
            Sign in
          </Link>
        </Text>
      }
    >
      <View style={styles.form}>
        <AuthTextInput
          label="Full name"
          placeholder="Your full name"
          value={form.fullName}
          onChangeText={(value) => updateField("fullName", value)}
        />
        <AuthTextInput
          label="Email address"
          placeholder="Enter your email"
          value={form.email}
          onChangeText={(value) => updateField("email", value)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <AuthTextInput
          label="Phone number"
          placeholder="Enter phone number"
          value={form.phone}
          onChangeText={(value) => updateField("phone", value)}
          keyboardType="phone-pad"
        />

        <View style={styles.optionGroup}>
          <Text style={styles.groupLabel}>User type</Text>
          <View style={styles.chipRow}>
            {USER_TYPE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => updateField("userType", option.value)}
                style={[
                  styles.chip,
                  form.userType === option.value ? styles.chipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    form.userType === option.value ? styles.chipTextActive : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {form.userType === "company" ? (
          <AuthTextInput
            label="Company / organization"
            placeholder="Enter company name"
            value={form.companyName}
            onChangeText={(value) => updateField("companyName", value)}
          />
        ) : null}
        <AuthTextInput
          label="Password"
          placeholder="Minimum 8 characters"
          value={form.password}
          onChangeText={(value) => updateField("password", value)}
          secureTextEntry
        />
        <AuthTextInput
          label="Confirm password"
          placeholder="Repeat password"
          value={form.confirmPassword}
          onChangeText={(value) => updateField("confirmPassword", value)}
          secureTextEntry
        />
        <PrimaryButton
          label={isSubmitting ? "Creating account..." : "Create account"}
          onPress={handleSignUp}
          disabled={isSubmitting}
        />
        <Text style={styles.helperText}>
          You can add your payment method and mobile money numbers later in Settings.
        </Text>
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      </View>
    </AuthShell>
  );
}

const createStyles = (palette) =>
  StyleSheet.create({
    form: {
      gap: 16,
    },
    optionGroup: {
      gap: 10,
    },
    groupLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: palette.text,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    chipActive: {
      borderColor: palette.primary,
      backgroundColor: palette.primaryMuted,
    },
    chipText: {
      fontSize: 13,
      fontWeight: "600",
      color: palette.text,
    },
    chipTextActive: {
      color: palette.primary,
    },
    footerText: {
      textAlign: "center",
      fontSize: 12,
      lineHeight: 18,
      color: palette.mutedText,
    },
    footerLink: {
      color: palette.primary,
      fontWeight: "700",
      cursor: "pointer",
    },
    helperText: {
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
