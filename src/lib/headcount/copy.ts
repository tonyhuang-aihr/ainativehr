/** 悬停文案 v1.1，与设计稿同一份，共 55 条。改文案先改生成稿再整表替换。 */

export const TOOLTIPS = [
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "编制与人员", text: "编制、在岗、在途、空缺只算正式员工；外包、实习、顾问单列人数。空缺 = 编制 −（在岗 + 在途）。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "Agent", text: "按实例个数计。年底 = 在用 + 已确认的新增、扩容 − 下线。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "全年预计", text: "只含人工成本和 Agent 日常成本；不含一次性费用（经济补偿、Agent 实施和培训费），由 HR 和 OD 统一管理；招聘、办公等成本暂未计入。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "人 : AI", text: "人做和 AI 做的工时占比，来自沙盘岗位拆解，人在前。目前只有基础架构组有拆解。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "在途变动", text: "已确认、还没生效的人员和 Agent 变动。全年净影响从生效日折算到年底，增加为正、减少为负。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "异常提示规则", text: "超预算：全年预计（人工 + Agent）> 部门预算，超出 > 2% 为高、其余为中；超编：在岗 + 在途 > 编制（含子部门），中；空缺偏多：空缺 ≥ 编制 5%，低；在途集中：在途笔数 ≥ 在岗人数 10%，低" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "合计空缺", text: "合计 = 编制 66 −（在岗 62 + 在途 3）。数据平台组超编 1 人，和其他组的空缺相互抵消，所以合计小于各组空缺之和。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "空缺", text: "空缺 = 编制 −（在岗 + 在途），只算正式员工。占用超过编制时显示 0，并标出超编人数。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "部门列表 · 全年预计", text: "人工 + Agent 日常成本，口径同上方「全年预计」指标卡。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "小组隐私规则", text: "你的范围内有不足 5 人的组，为避免用合计反推，各组成本都只显示区间；合计为精确值。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "用工类型", text: "编制只算正式员工；外包、实习、顾问单列人数，成本按各类型人均估算，计入人工成本。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "人员排序", text: "人员行不能按成本排序。只选在途时按生效日从早到晚，其余按汇报层级。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "在途合计", text: "合计先用未取整的金额加总，再取整到 0.5 万，可能和逐行相加略有差异。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "人员全年成本", text: "按职级均值估算，非本人薪资" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "人员全年成本影响", text: "只有在途行有值：从生效日起折算到年底，增加为正、减少为负；同样按职级均值估算，显示区间。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "状态 · 生效日", text: "在途行显示状态和生效日；在岗行生效日为空。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "席位费", text: "每个实例每月的价格，由 OD 在配置表维护。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "Agent 状态 · 生效日", text: "实例数增加记为待扩容；单价变化或实例数减少记为待调整。筛选和摘要里两者合并为「待扩容或调整」。" },
  { page: "负责人视图 · 总览（多部门，赵一）", metric: "Agent 全年成本", text: "席位费和算力费 × 实例数，按在用天数折算到当年。" },
  { page: "负责人视图 · 单部门（钱二）", metric: "全年预计", text: "只含人工成本和 Agent 日常成本；不含一次性费用（经济补偿、Agent 实施和培训费），由 HR 和 OD 统一管理；招聘、办公等成本暂未计入。" },
  { page: "负责人视图 · 单部门（钱二）", metric: "当前成本（年化）", text: "在岗人员按职级均值（外包等按类型人均）+ 在用 Agent 的席位费和算力费，按全年 12 个月计算。" },
  { page: "负责人视图 · 单部门（钱二）", metric: "接下来会变", text: "已确认、还没生效的变动，按生效日折算到当年，增加为正、减少为负。点任一行，打开对应明细并自动选中「在途」。" },
  { page: "负责人视图 · 单部门（钱二）", metric: "年底预计", text: "年底人数 = 现在 + 加入 − 离开（正式员工）；全年成本 = 当前成本（年化）+ 在途影响，即 ① + ②。" },
  { page: "OD 底座 · 总览", metric: "编制与人员", text: "编制、在岗、在途、空缺只算正式员工。在途 = 已接受 offer 待入职，公司合计不含内部调动 2 人。空缺 = 编制 −（在岗 + 在途）。外包、实习、顾问单列人数，成本照常计入。" },
  { page: "OD 底座 · 总览", metric: "Agent", text: "按实例个数计。在用 = 已上线的实例；年底 = 在用 + 已确认的新增、扩容 − 下线。" },
  { page: "OD 底座 · 总览", metric: "全年预计 vs 预算总包", text: "公司口径 = 各部门日常成本（人工 + Agent 席位、算力）+ 一次性费用。预算总包 = 部门预算合计 15,970.0 万 + 一次性费用预留 30.0 万（示例）。" },
  { page: "OD 底座 · 总览", metric: "人 : AI", text: "由人做和由 AI 做的工时占比，来自沙盘岗位拆解，人在前。和 Agent 个数是两回事。" },
  { page: "OD 底座 · 总览", metric: "一次性费用 vs 预留", text: "经济补偿和 Agent 实施、培训费，由 HR/OD 统一管理，不摊到部门；预留为示例数据。" },
  { page: "OD 底座 · 总览", metric: "异常提示规则", text: "超预算：全年预计（人工 + Agent）> 部门预算，超出 > 2% 为高、其余为中；超编：在岗 + 在途 > 编制（含子部门），中；空缺偏多：空缺 ≥ 编制 5%，低；在途集中：在途笔数 ≥ 在岗人数 10%，低" },
  { page: "OD 底座 · 总览", metric: "部门合计", text: "部门合计只含日常成本（人工 + Agent）。加上一次性费用 24.5 万，公司合计 16,095.5 万，比预算总包 16,000.0 万多 95.5 万，见上方指标卡。在途、空缺不重复计算内部调动 2 人。" },
  { page: "OD 底座 · 总览", metric: "在途", text: "已接受 offer 待入职、已审批待转入的正式员工人数。" },
  { page: "OD 底座 · 总览", metric: "空缺", text: "空缺 = 编制 −（在岗 + 在途），只算正式员工。占用超过编制时显示 0，并标出超编人数。" },
  { page: "OD 底座 · 总览", metric: "全年预计", text: "不含一次性费用（经济补偿、Agent 实施和培训费）；招聘、办公等成本暂未计入" },
  { page: "OD 底座 · 总览", metric: "部门预算", text: "OD 手工录入，只对比人工和 Agent 日常成本；本页为示例数据。" },
  { page: "OD 底座 · 总览", metric: "差额", text: "全年预计 − 部门预算。正数为超出（红色），负数为结余。" },
  { page: "OD 底座 · 部门页", metric: "全年预计成本", text: "部门口径：只含人工成本和 Agent 日常成本（席位、算力）。本部门离职涉及的经济补偿计入公司一次性费用，由 HR/OD 统一管理，不摊到部门。" },
  { page: "OD 底座 · 部门页", metric: "≈ ① + ②", text: "各项分别取整到 0.5 万，相加与合计差 0.5 万；合计按未取整金额加总后取整。" },
  { page: "OD 底座 · 部门页", metric: "当前成本（年化）", text: "在岗人员按职级均值（外包等按类型人均）+ 在用 Agent 的席位费和算力费，按全年 12 个月计算。" },
  { page: "OD 底座 · 部门页", metric: "接下来会变", text: "已确认、还没生效的变动，按生效日折算到当年，增加为正、减少为负。点任一行，打开对应明细并自动选中「在途」。" },
  { page: "OD 底座 · 部门页", metric: "年底预计", text: "年底人数 = 现在 + 加入 − 离开（正式员工）；全年成本 = 当前成本（年化）+ 在途影响，即 ① + ②。" },
  { page: "OD 底座 · 部门页", metric: "用工类型", text: "编制只算正式员工；外包、实习、顾问单列人数，成本按各类型人均估算，计入人工成本。" },
  { page: "OD 底座 · 部门页", metric: "人员排序", text: "人员行不能按成本排序。只选在途时按生效日从早到晚，其余按汇报层级。" },
  { page: "OD 底座 · 部门页", metric: "人员全年成本", text: "按职级均值和当年在岗天数折算，非本人薪资；精确估算取整到 0.5 万。" },
  { page: "OD 底座 · 部门页", metric: "人员全年成本影响", text: "只有在途行有值：从生效日起折算到年底，增加为正、减少为负。" },
  { page: "OD 底座 · 部门页", metric: "状态 · 生效日", text: "在途行显示状态和生效日；在岗行生效日为空。" },
  { page: "OD 底座 · 部门页", metric: "补偿标记", text: "只有 OD 和 HR 能看到。只存补偿标记，不存离职类型；补偿计入公司一次性费用，不摊到部门；个人补偿估算不存储、不展示。" },
  { page: "OD 底座 · 部门页", metric: "席位费", text: "每个实例每月的价格，由 OD 在配置表维护。" },
  { page: "OD 底座 · 部门页", metric: "Agent 状态 · 生效日", text: "实例数增加记为待扩容；单价变化或实例数减少记为待调整。筛选和摘要里两者合并为「待扩容或调整」。" },
  { page: "OD 底座 · 部门页", metric: "Agent 全年成本", text: "席位费和算力费 × 实例数，按在用天数折算到当年；实施、培训等一次性费用不在这里。" },
  { page: "OD 底座 · 部门页", metric: "在途合计", text: "合计先用未取整的金额加总，再取整到 0.5 万，可能和逐行相加略有差异。" },
  { page: "场景与时间轴 v2", metric: "场景总成本", text: "场景总成本 = 部门日常成本（人工 + Agent 席位、算力）+ 一次性费用（经济补偿、Agent 实施和培训费）。一次性费用由 HR/OD 统一管理，不摊到部门。" },
  { page: "场景与时间轴 v2", metric: "时间轴", text: "场景新增 = 本场景在基线之上加减的数量；括号里是加上已确认在途后，季初到季末的实际变化。两个数都直接取成本引擎结果。场景里的变动统一按该季第一天生效（P0）。" },
  { page: "场景与时间轴 v2", metric: "未归属部门 Agent", text: "沙盘里没有岗位拆解的 Agent，只计入公司口径，不分到部门。" },
  { page: "人员明细", metric: "外包（部门）", text: "外包只有座位数，按部门汇总，不列姓名" },
  { page: "事业部底座 · 总览", metric: "范围合计", text: "范围合计只含日常成本（人工 + Agent），对比范围内部门预算之和；一次性费用（经济补偿、Agent 实施和培训费）由 HR 和 OD 统一管理，不计入。" },
] as const;

export function tooltip(page: string, metric: string): string {
  const found = TOOLTIPS.find((item) => item.page === page && item.metric === metric);
  if (!found) throw new Error(`缺少悬停文案：${page} / ${metric}`);
  return found.text;
}

/** 页面上的 ⓘ 都从这里取，保证文案和悬停表同一条。 */
export function slot(page: string, metric: string): string {
  return tooltip(page, metric);
}

export const YEAR_FORECAST_OD = slot("OD 底座 · 总览", "全年预计");
export const YEAR_FORECAST_LEADER = slot("负责人视图 · 总览（多部门，赵一）", "全年预计");
export const YEAR_FORECAST_LEADER_DEPT = slot("负责人视图 · 总览（多部门，赵一）", "部门列表 · 全年预计");
export const PERSON_COST_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "人员全年成本");
export const PERSON_COST_NOTE_OD = slot("OD 底座 · 部门页", "人员全年成本");
export const PERSON_IMPACT_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "人员全年成本影响");
export const PERSON_IMPACT_NOTE_OD = slot("OD 底座 · 部门页", "人员全年成本影响");
export const PERSON_STATUS_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "状态 · 生效日");
export const PERSON_STATUS_NOTE_OD = slot("OD 底座 · 部门页", "状态 · 生效日");
export const PERSON_SORT_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "人员排序");
export const EMPLOYMENT_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "用工类型");
export const TRANSIT_SUM_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "在途合计");
export const AGENT_STATUS_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "Agent 状态 · 生效日");
export const AGENT_STATUS_NOTE_OD = slot("OD 底座 · 部门页", "Agent 状态 · 生效日");
export const AGENT_COST_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "Agent 全年成本");
export const AGENT_COST_NOTE_OD = slot("OD 底座 · 部门页", "Agent 全年成本");
export const SEAT_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "席位费");
export const SEAT_NOTE_OD = slot("OD 底座 · 部门页", "席位费");
export const COMP_MARK_NOTE = slot("OD 底座 · 部门页", "补偿标记");
export const DEPT_TOTAL_NOTE = slot("OD 底座 · 总览", "部门合计");
export const VACANCY_NOTE = slot("OD 底座 · 总览", "空缺");
export const VACANCY_NOTE_LEADER = slot("负责人视图 · 总览（多部门，赵一）", "空缺");
export const VACANCY_TOTAL_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "合计空缺");
export const BUDGET_NOTE = slot("OD 底座 · 总览", "部门预算");
export const GAP_NOTE = slot("OD 底座 · 总览", "差额");
export const ONE_OFF_NOTE = slot("OD 底座 · 总览", "一次性费用 vs 预留");
export const TIMELINE_CHANGE_NOTE = slot("场景与时间轴 v2", "时间轴");
export const SCENARIO_TOTAL_NOTE = slot("场景与时间轴 v2", "场景总成本");
export const OUTSOURCE_SEAT_NOTE = slot("人员明细", "外包（部门）");
export const SCOPE_TOTAL_NOTE = slot("事业部底座 · 总览", "范围合计");
export const UNATTRIBUTED_AGENT_NOTE = slot("场景与时间轴 v2", "未归属部门 Agent");

/**
 * 悬停表没有 HRBP 版「场景总成本」。事业部合计不含一次性费用，所以不用上面那条（那条把一次性费用算进总成本）。
 * 不另加第 56 条。
 */
export const HRBP_SCENARIO_TOTAL_NOTE =
  "场景总成本 = 日常成本（人工 + Agent 席位、算力）。一次性费用（经济补偿、Agent 实施和培训费）由 HR 和 OD 统一管理，不计入。";

export function overviewCardNote(audience: "od" | "leader" | "hrbp", label: string): string | null {
  if (audience === "hrbp") {
    if (label === "编制与人员") return slot("负责人视图 · 总览（多部门，赵一）", "编制与人员");
    if (label === "Agent") return slot("负责人视图 · 总览（多部门，赵一）", "Agent");
    if (label === "人 : AI 按工时") return slot("OD 底座 · 总览", "人 : AI");
    if (label === "全年预计 vs 部门预算") return YEAR_FORECAST_LEADER;
    if (label === "在途变动") return slot("负责人视图 · 总览（多部门，赵一）", "在途变动");
    return null;
  }
  if (label === "编制与人员") return audience === "od" ? slot("OD 底座 · 总览", "编制与人员") : slot("负责人视图 · 总览（多部门，赵一）", "编制与人员");
  if (label === "Agent") return audience === "od" ? slot("OD 底座 · 总览", "Agent") : slot("负责人视图 · 总览（多部门，赵一）", "Agent");
  if (label === "人 : AI 按工时") return audience === "od" ? slot("OD 底座 · 总览", "人 : AI") : slot("负责人视图 · 总览（多部门，赵一）", "人 : AI");
  if (label === "全年预计 vs 预算总包") return slot("OD 底座 · 总览", "全年预计 vs 预算总包");
  if (label === "全年预计 vs 部门预算") return YEAR_FORECAST_LEADER;
  if (label === "一次性费用 vs 预留") return ONE_OFF_NOTE;
  if (label === "在途变动") return slot("负责人视图 · 总览（多部门，赵一）", "在途变动");
  return null;
}

export function forecastHeroNote(audience: "od" | "leader"): string {
  return audience === "od" ? slot("OD 底座 · 部门页", "全年预计成本") : slot("负责人视图 · 单部门（钱二）", "全年预计");
}

export function stepCardNote(audience: "od" | "leader", step: "当前成本（年化）" | "接下来会变" | "年底预计"): string {
  if (audience === "od") {
    if (step === "当前成本（年化）") return slot("OD 底座 · 部门页", "当前成本（年化）");
    if (step === "接下来会变") return slot("OD 底座 · 部门页", "接下来会变");
    return slot("OD 底座 · 部门页", "年底预计");
  }
  if (step === "当前成本（年化）") return slot("负责人视图 · 单部门（钱二）", "当前成本（年化）");
  if (step === "接下来会变") return slot("负责人视图 · 单部门（钱二）", "接下来会变");
  return slot("负责人视图 · 单部门（钱二）", "年底预计");
}

export function rosterFieldNote(audience: "od" | "leader", metric: "用工类型" | "人员排序" | "在途合计" | "人员全年成本" | "人员全年成本影响" | "状态 · 生效日" | "席位费" | "Agent 状态 · 生效日" | "Agent 全年成本"): string {
  if (audience === "od") {
    if (metric === "用工类型") return slot("OD 底座 · 部门页", "用工类型");
    if (metric === "人员排序") return slot("OD 底座 · 部门页", "人员排序");
    if (metric === "在途合计") return slot("OD 底座 · 部门页", "在途合计");
    if (metric === "人员全年成本") return PERSON_COST_NOTE_OD;
    if (metric === "人员全年成本影响") return PERSON_IMPACT_NOTE_OD;
    if (metric === "状态 · 生效日") return PERSON_STATUS_NOTE_OD;
    if (metric === "席位费") return SEAT_NOTE_OD;
    if (metric === "Agent 状态 · 生效日") return AGENT_STATUS_NOTE_OD;
    return AGENT_COST_NOTE_OD;
  }
  if (metric === "用工类型") return EMPLOYMENT_NOTE;
  if (metric === "人员排序") return PERSON_SORT_NOTE;
  if (metric === "在途合计") return TRANSIT_SUM_NOTE;
  if (metric === "人员全年成本") return PERSON_COST_NOTE;
  if (metric === "人员全年成本影响") return PERSON_IMPACT_NOTE;
  if (metric === "状态 · 生效日") return PERSON_STATUS_NOTE;
  if (metric === "席位费") return SEAT_NOTE;
  if (metric === "Agent 状态 · 生效日") return AGENT_STATUS_NOTE;
  return AGENT_COST_NOTE;
}

export function alertRuleNote(audience: "od" | "leader" | "hrbp"): string {
  return audience === "od" ? slot("OD 底座 · 总览", "异常提示规则") : slot("负责人视图 · 总览（多部门，赵一）", "异常提示规则");
}

export const GROUP_PRIVACY_NOTE = slot("负责人视图 · 总览（多部门，赵一）", "小组隐私规则");
export const OD_TRANSIT_NOTE = slot("OD 底座 · 总览", "在途");

export const ONE_OFF_CARD_LABEL = "一次性费用 vs 预留";
export const COMPARE_SCROLL_HINT = "左右滑动查看其他场景，左侧名称保持不动";
export const PERSON_COST_HEADER = "全年成本估算（区间）";
