import AuthConfig, { type AuthSettings } from "@/components/AuthConfig";

export function AuthConfigTab({
  settings,
  onChange,
}: {
  settings: AuthSettings;
  onChange: (next: AuthSettings) => void;
}) {
  return <AuthConfig settings={settings} onChange={onChange} />;
}
