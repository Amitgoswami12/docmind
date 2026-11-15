import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign in · DocMind" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
