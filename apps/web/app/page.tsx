import { AppShell } from "../src/components/app-shell";
import { getPublicLinks } from "../src/server/deps";

export default function Page() {
  return <AppShell links={getPublicLinks()} />;
}
