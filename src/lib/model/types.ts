export type ColumnField =
  | "name"
  | "department"
  | "title"
  | "manager"
  | "employeeId"
  | "level"
  | "annualCost"
  | "hireDate"
  | "location"
  | "performance"
  | "email"
  | "status";

export type ColumnMatch = {
  field: ColumnField;
  header: string;
  confidence: number;
  reason: string;
};

export type SheetTable = {
  name: string;
  headers: string[];
  rows: string[][];
};

export type RawPerson = {
  rowNumber: number;
  name: string;
  originalName: string;
  employeeId: string;
  departmentRaw: string;
  title: string;
  managerRaw: string;
  level: string;
  annualCost: number | null;
  hireDate: string;
  location: string;
  performance: string;
  email: string;
  status: string;
};

export type Person = {
  id: string;
  rowNumber: number;
  name: string;
  originalName: string;
  employeeId: string;
  departmentRaw: string;
  departmentPath: string[];
  title: string;
  managerName: string;
  managerId: string | null;
  level: string;
  annualCost: number | null;
  hireDate: string;
  location: string;
  performance: string;
  email: string;
  /** 只是个别人调动时标在人上。不进入决策轨迹。 */
  pendingRoleConfirm?: boolean;
};

export type Department = {
  id: string;
  name: string;
  path: string[];
  parentId: string | null;
  headId: string | null;
};

export type OrgSnapshot = {
  people: Person[];
  departments: Department[];
};

export type Severity = "red" | "yellow" | "blue";

export type RuleCode =
  | "span_wide"
  | "span_narrow"
  | "layers_deep"
  | "single_person_dept"
  | "empty_dept"
  | "reporting_cycle"
  | "missing_manager";

export type DataIssueCode =
  | "missing_manager"
  | "reporting_cycle"
  | "duplicate_name"
  | "ambiguous_manager";

export type OrgIssue = {
  id: string;
  code: RuleCode;
  severity: Severity;
  title: string;
  message: string;
  personIds: string[];
  departmentIds: string[];
};

export type RuleThresholds = {
  /** 直接下级人数大于该值时记为幅度过宽。 */
  spanWide: number;
  /** 直接下级人数在 1 到该值之间时记为幅度过窄。 */
  spanNarrow: number;
  /** 部门路径层数大于该值时记为层级过深。 */
  maxLayers: number;
};

export type ExecutionMode = "human" | "ai" | "collab";

export type RoleTask = {
  id: string;
  name: string;
  /** 占该岗位工时的比例，1 = 100%。 */
  timeShare: number;
  frequency: string;
  mode: ExecutionMode;
  reason: string;
  confidence: number;
  source: "ai" | "template" | "user";
  edited: boolean;
};

/** 草稿和待复核都不进入人机比、成本汇总。 */
export type RolePosture = "active" | "draft" | "pending_review";

export type RoleDecomposition = {
  roleTitle: string;
  tasks: RoleTask[];
  updatedAt: string;
  source: "ai" | "template" | "user";
  posture?: RolePosture;
};

export type DecisionStatus = "executed" | "rejected" | "pending";

export type FieldOrigin = "ai" | "user";

export type DecisionFieldKey = "background" | "intent" | "expectedEffect" | "reviewDate";

export type DecisionField = {
  key: DecisionFieldKey;
  text: string;
  origin: FieldOrigin;
};

/** 发起人和审批人只存角色，不存姓名。 */
export type DecisionRecord = {
  id: string;
  departmentId: string;
  title: string;
  date: string;
  status: DecisionStatus;
  initiatorRole: string;
  approverRole: string | null;
  beforeText: string;
  afterText: string;
  fields: DecisionField[];
  opinion: string;
  sourceNote?: string;
};

export type ViewerRole = "od" | "approver" | "admin";

export type AppSettings = {
  /** 元 / 每个使用 AI 的任务 / 月。 */
  computeUnitPrice: number;
  /** 人机协同任务里记到 AI 一侧的比例。 */
  collabAiShare: number;
  /** 计算释放工时用的月标准工时。 */
  monthlyHours: number;
  thresholds: RuleThresholds;
  viewerRole: ViewerRole;
};

export type Scenario = {
  id: string;
  name: string;
  kind: "baseline" | "draft";
  snapshot: OrgSnapshot;
  decompositions: Record<string, RoleDecomposition>;
  ignoredCodes: RuleCode[];
};

export type AuditEntry = {
  id: string;
  at: string;
  source: "user" | "ai";
  label: string;
};

export type ImportMeta = {
  filename: string;
  importedAt: string;
  sampleId: string | null;
  sampleLabel: string | null;
  sheetName: string;
  peopleCount: number;
  departmentCount: number;
  aiMode: "offline" | "llm";
};

/** 两人之间的协作只保留次数。不存消息正文、会议纪要或任何内容字段。 */
export type CollabPair = {
  personA: string;
  personB: string;
  messages: number | null;
  meetings: number | null;
  okrAlignments: number | null;
};

export type KeyResult = {
  title: string;
  progress: number | null;
};

export type PersonOkr = {
  personName: string;
  objective: string;
  alignedTo: string;
  keyResults: KeyResult[];
  unalignedDepartments: string[];
};

/** 绩效目标只保留权重，不保留评级、分数或排名。 */
export type PersonGoal = {
  personName: string;
  name: string;
  weight: number;
};

export type CollabBundle = {
  sample: boolean;
  windowDays: number;
  updatedAt: string;
  pairs: CollabPair[];
  okrs: PersonOkr[];
  goals: PersonGoal[];
  /** 读到但未保存的内容类列名，用来提示用户这些列被丢掉了。 */
  ignoredContentHeaders: string[];
  /** 读到但未保存的评级、排名类列名。 */
  ignoredRankHeaders: string[];
};

export type Workspace = {
  version: 1;
  scenarios: Scenario[];
  activeScenarioId: string;
  settings: AppSettings;
  templates: Record<string, RoleDecomposition>;
  importMeta: ImportMeta;
  audit: AuditEntry[];
  collab: CollabBundle | null;
  /** 部门决策轨迹。旧场景文件可能没有这一项。 */
  decisions?: DecisionRecord[];
};

export const DEFAULT_THRESHOLDS: RuleThresholds = {
  spanWide: 8,
  spanNarrow: 2,
  maxLayers: 6,
};

export const DEFAULT_SETTINGS: AppSettings = {
  computeUnitPrice: 200,
  collabAiShare: 0.5,
  monthlyHours: 160,
  thresholds: DEFAULT_THRESHOLDS,
  viewerRole: "od",
};

export const FIELD_LABEL: Record<ColumnField, string> = {
  name: "姓名",
  department: "部门",
  title: "岗位",
  manager: "直属上级",
  employeeId: "工号",
  level: "职级",
  annualCost: "年度人力成本",
  hireDate: "入职时间",
  location: "工作地点",
  performance: "绩效",
  email: "邮箱",
  status: "状态",
};

export const REQUIRED_FIELDS: ColumnField[] = [
  "name",
  "department",
  "title",
  "manager",
];

export function canSeeIndividualPay(role: ViewerRole): boolean {
  return role === "od" || role === "admin";
}

/** 负责人卡片含个人协作次数，只给 OD / 管理员。业务负责人只看部门间连线。 */
export function canSeeLeaderCard(role: ViewerRole): boolean {
  return role === "od" || role === "admin";
}

/** 方案里的「调整中」标识只给能看方案的人。审批人看不到。 */
export function canSeePlanMarkers(role: ViewerRole): boolean {
  return role === "od" || role === "admin";
}
