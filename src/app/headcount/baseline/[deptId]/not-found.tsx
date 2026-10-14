import { AccessStatePage, DEPARTMENT_MISSING_TEXT } from "@/components/headcount/access-state";

export default function DepartmentNotFoundPage() {
  return <AccessStatePage message={DEPARTMENT_MISSING_TEXT} />;
}
