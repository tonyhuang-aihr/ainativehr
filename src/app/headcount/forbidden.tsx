import { AccessStatePage, SCOPE_DENIED_TEXT } from "@/components/headcount/access-state";

export default function ForbiddenPage() {
  return <AccessStatePage message={SCOPE_DENIED_TEXT} />;
}
