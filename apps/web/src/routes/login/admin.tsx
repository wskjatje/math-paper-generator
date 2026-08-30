import { createFileRoute } from "@tanstack/react-router";
import { AccountLoginForm } from "@/components/auth/AccountLoginForm";

export const Route = createFileRoute("/login/admin")({
  component: () => <AccountLoginForm preferPortal="admin" />,
});
