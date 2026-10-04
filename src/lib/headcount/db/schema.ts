import { bigint, boolean, integer, pgTable, primaryKey, real, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: bigint("locked_until", { mode: "number" }),
});

export const departments = pgTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  quotaFormal: integer("quota_formal").notNull().default(0),
  quotaAgent: integer("quota_agent").notNull().default(0),
  source: text("source").notNull().default("import"),
  version: integer("version").notNull().default(1),
});

export const departmentClosure = pgTable(
  "department_closure",
  {
    ancestorId: text("ancestor_id").notNull(),
    descendantId: text("descendant_id").notNull(),
    depth: integer("depth").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ancestorId, table.descendantId] })],
);

export const userDepartments = pgTable(
  "user_departments",
  {
    userId: text("user_id").notNull(),
    departmentId: text("department_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.departmentId] })],
);

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  employeeNo: text("employee_no").notNull(),
  name: text("name").notNull(),
  departmentId: text("department_id").notNull(),
  title: text("title").notNull(),
  grade: text("grade").notNull(),
  managerId: text("manager_id"),
  isManager: boolean("is_manager").notNull().default(false),
  employmentType: text("employment_type").notNull(),
  city: text("city").notNull().default(""),
  hireDate: text("hire_date"),
  source: text("source").notNull().default("import"),
  version: integer("version").notNull().default(1),
});

export const movements = pgTable("movements", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  personName: text("person_name").notNull(),
  employeeNo: text("employee_no").notNull().default(""),
  departmentId: text("department_id").notNull(),
  fromDepartmentId: text("from_department_id"),
  toDepartmentId: text("to_department_id"),
  title: text("title").notNull().default(""),
  grade: text("grade").notNull().default(""),
  employmentType: text("employment_type").notNull().default("正式"),
  effectiveDate: text("effective_date").notNull(),
  compMark: text("comp_mark"),
  hireDate: text("hire_date"),
  city: text("city"),
  agentType: text("agent_type"),
  instanceDelta: integer("instance_delta"),
  seatMonthly: integer("seat_monthly"),
  computeMonthly: integer("compute_monthly"),
  oneOff: integer("one_off"),
  source: text("source").notNull().default("import"),
  version: integer("version").notNull().default(1),
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  agentType: text("agent_type").notNull(),
  departmentId: text("department_id").notNull(),
  instances: integer("instances").notNull(),
  seatMonthly: integer("seat_monthly").notNull(),
  computeMonthly: integer("compute_monthly").notNull(),
  source: text("source").notNull().default("import"),
  version: integer("version").notNull().default(1),
});

export const gradeBands = pgTable("grade_bands", {
  grade: text("grade").primaryKey(),
  annualCost: integer("annual_cost").notNull(),
  year: integer("year").notNull(),
  source: text("source").notNull().default("manual"),
  version: integer("version").notNull().default(1),
});

export const agentPrices = pgTable("agent_prices", {
  agentType: text("agent_type").primaryKey(),
  seatMonthly: integer("seat_monthly").notNull(),
  computeMonthly: integer("compute_monthly").notNull(),
  oneOff: integer("one_off").notNull().default(0),
  source: text("source").notNull().default("manual"),
  version: integer("version").notNull().default(1),
});

export const cityWages = pgTable("city_wages", {
  city: text("city").primaryKey(),
  year: integer("year").notNull(),
  monthlyAvg: integer("monthly_avg").notNull(),
  sourceNote: text("source_note").notNull().default(""),
  updatedOn: text("updated_on").notNull().default(""),
});

export const otherRates = pgTable("other_rates", {
  employmentType: text("employment_type").primaryKey(),
  annualCost: integer("annual_cost").notNull(),
});

export const otherSeats = pgTable("other_seats", {
  id: text("id").primaryKey(),
  departmentId: text("department_id").notNull(),
  employmentType: text("employment_type").notNull(),
  headcount: integer("headcount").notNull(),
});

export const departmentBudgets = pgTable("department_budgets", {
  departmentId: text("department_id").primaryKey(),
  year: integer("year").notNull(),
  amount: integer("amount").notNull(),
  source: text("source").notNull().default("manual"),
  version: integer("version").notNull().default(1),
});

export const planSettings = pgTable("plan_settings", {
  id: integer("id").primaryKey(),
  year: integer("year").notNull(),
  asOf: text("as_of").notNull(),
  companyBudget: integer("company_budget").notNull(),
  oneOffBudget: integer("one_off_budget"),
  exactForLeaders: boolean("exact_for_leaders").notNull().default(false),
  dataVersion: text("data_version").notNull(),
  source: text("source").notNull().default("import"),
});

export const tenureAverages = pgTable(
  "tenure_averages",
  {
    departmentId: text("department_id").notNull(),
    grade: text("grade").notNull(),
    averageMonths: real("average_months").notNull(),
    headcount: integer("headcount").notNull(),
  },
  (table) => [primaryKey({ columns: [table.departmentId, table.grade] })],
);

export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  source: text("source").notNull().default("manual"),
  version: integer("version").notNull().default(1),
  note: text("note").notNull().default(""),
});

export const accessLogs = pgTable("access_logs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  departmentId: text("department_id").notNull(),
  departmentName: text("department_name").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const toggleLogs = pgTable("toggle_logs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  enabled: boolean("enabled").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const operationLogs = pgTable("operation_logs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const aiConclusions = pgTable(
  "ai_conclusions",
  {
    departmentId: text("department_id").notNull(),
    dataVersion: text("data_version").notNull(),
    sentence: text("sentence").notNull(),
    origin: text("origin").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.departmentId, table.dataVersion] })],
);
