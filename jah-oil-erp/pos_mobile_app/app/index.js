import { Redirect } from "expo-router";

import LoadingScreen from "../components/ui/LoadingScreen";
import { useAuth } from "../features/auth/AuthProvider";

export default function IndexScreen() {
  const { isHydrating, isAuthenticated, session } = useAuth();

  if (isHydrating) {
    return (
      <LoadingScreen
        title="Starting POS"
        description="Restoring your cashier session and local sales queue."
      />
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (session?.mustChangePassword) {
    return <Redirect href="/change-password" />;
  }

  return <Redirect href="/pos" />;
}
