import type { CompMark } from "@/lib/headcount/severance";

export type EmploymentType = "正式" | "外包" | "实习" | "顾问";
export type MoveKind = "入职" | "离职" | "转入" | "转出" | "Agent 新增" | "Agent 下线" | "Agent 调整";
export type PersonStatus = "在岗" | "待入职" | "待离职" | "待转入" | "待转出";
export type RecordSource = "import" | "manual" | "report" | "sandbox";

export type DepartmentNode = {
  id: string;
  name: string;
  parentId: string | null;
  quotaFormal: number;
  quotaAgent: number;
};

export type PersonSeed = {
  id: string;
  name: string;
  employeeNo: string;
  departmentId: string;
  title: string;
  grade: string;
  managerId: string | null;
  isManager: boolean;
  employmentType: EmploymentType;
  city: string;
  /** 只有补偿标记为 N 或 N+1 的人才会有入职日期。 */
  hireDate?: string;
  source: RecordSource;
  version: number;
};

export type MovementSeed = {
  id: string;
  kind: MoveKind;
  name: string;
  employeeNo: string;
  departmentId: string;
  fromDepartmentId?: string;
  toDepartmentId?: string;
  title: string;
  grade: string;
  employmentType: EmploymentType;
  effectiveDate: string;
  compMark?: CompMark;
  hireDate?: string;
  city?: string;
  agentType?: string;
  instanceDelta?: number;
  seatMonthly?: number;
  computeMonthly?: number;
  oneOff?: number;
  source: RecordSource;
  version: number;
};

export type AgentSeed = {
  id: string;
  name: string;
  agentType: string;
  departmentId: string;
  instances: number;
  seatMonthly: number;
  computeMonthly: number;
  source: RecordSource;
  version: number;
};

export type OtherSeat = {
  departmentId: string;
  employmentType: Exclude<EmploymentType, "正式">;
  count: number;
  annual: number;
};

export type PlanInput = {
  year: number;
  asOf: string;
  companyBudget: number;
  oneOffBudget: number | null;
  departments: DepartmentNode[];
  gradeAnnual: Record<string, number>;
  people: PersonSeed[];
  movements: MovementSeed[];
  agents: AgentSeed[];
  others: OtherSeat[];
  cityMonthly: Record<string, number>;
  budgets: Record<string, number>;
  tenure: { departmentId: string; grade: string; averageMonths: number; count: number }[];
};
