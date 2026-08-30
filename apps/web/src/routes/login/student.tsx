import { createFileRoute } from "@tanstack/react-router";
import { AccountLoginForm } from "@/components/auth/AccountLoginForm";

export const Route = createFileRoute("/login/student")({
  component: () => <AccountLoginForm preferPortal="student" />,
});
