import { describe, expect, it } from "vitest";
import { OUTSOURCE_SEAT_NOTE, TOOLTIPS } from "@/lib/headcount/copy";
import { computePlan } from "@/lib/headcount/engine";
import { buildLeaderView } from "@/lib/headcount/leaderView";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { collectAgentLines, collectPersonLines, defaultDetailQuery, detailHref, pageAgents, pagePeople, peopleRosterSummary, type PeopleCounts } from "@/lib/headcount/rosterPage";
import { sortByReporting } from "@/lib/headcount/sortPeople";

const result = computePlan(samplePlan());

describe("人员明细和 Agent 明细分页", () => {
  const people = collectPersonLines(result, DEPT.plat);
  const agents = collectAgentLines(result, DEPT.plat);

  it("默认只返回当前页，筛选后回到第 1 页，人数按编制口径合计", () => {
    const first = pagePeople(people, { ...defaultDetailQuery(), peopleSize: 10 }, { exact: true });
    const second = pagePeople(people, { ...defaultDetailQuery(), peoplePage: 2, peopleSize: 10 }, { exact: true });
    expect(first.rows).toHaveLength(10);
    expect(first.total).toBeGreaterThan(10);
    expect(second.rows).toHaveLength(Math.min(10, first.total - 10));
    expect(second.rows.map((row) => row.id)).not.toEqual(first.rows.map((row) => row.id));
    expect(first.counts.全部).toBe(first.counts.在岗无变动 + first.counts.待入职 + first.counts.待转入 + first.counts.待离职 + first.counts.待转出);
    expect(first.counts.在途).toBe(first.counts.待入职 + first.counts.待转入 + first.counts.待离职 + first.counts.待转出);
    const href = detailHref("/headcount/leader?dept=plat&page=3&people=在岗无变动", { people: "在途", page: null, open: "people" });
    expect(href).not.toMatch(/[?&]page=/);
    expect(href).toContain("people=");
    const view = buildLeaderView(result, DEPT.plat, { exact: true, detail: { ...defaultDetailQuery(), peoplePage: 2, peopleSize: 10 } });
    expect(view.people.rows).toHaveLength(second.rows.length);
    expect(JSON.stringify(view.people.rows)).toBe(JSON.stringify(second.rows));
  });

  it("在岗和全部按汇报关系排，在途只按生效日，都不按成本", () => {
    const all = pagePeople(people, { ...defaultDetailQuery(), peopleSize: 50 }, { exact: true });
    const reporting = sortByReporting(people).map((line) => line.id);
    expect(all.sort).toBe("reporting");
    expect(all.rows.map((row) => row.id)).toEqual(reporting.slice(0, all.rows.length));
    const costs = people.map((line) => line.yearCost);
    const byCost = [...people].sort((left, right) => right.yearCost - left.yearCost).map((line) => line.id);
    expect(costs.some((cost, index) => index > 0 && cost !== costs[0])).toBe(true);
    expect(all.rows.map((row) => row.id)).not.toEqual(byCost.slice(0, all.rows.length));
    const transit = pagePeople(people, { ...defaultDetailQuery(), peopleStatuses: ["在途"], peopleSize: 50 }, { exact: true });
    expect(transit.sort).toBe("effective");
    const dates = transit.rows.map((row) => row.effectiveDate);
    expect(dates).toEqual([...dates].sort((left, right) => (left || "9999").localeCompare(right || "9999")));
    expect(transit.summary?.count).toBe(transit.total);
    expect(transit.rows.every((row) => row.status !== "在岗")).toBe(true);
  });

  it("在途合计人数不足 5 时金额用区间，负责人返回体没有一次性字段", () => {
    const one = pagePeople(people, { ...defaultDetailQuery(), peopleStatuses: ["待离职"], peopleSize: 10 }, { exact: false, preciseSummary: true });
    if (one.total < 5 && one.summary) {
      expect(one.summary.year).toMatch(/–|—/);
    }
    const precise = pagePeople(people, { ...defaultDetailQuery(), peopleStatuses: ["在途"], peopleSize: 50 }, { exact: true });
    expect(precise.summary?.year).not.toMatch(/–/);
    const view = buildLeaderView(result, DEPT.plat, { exact: false, detail: { ...defaultDetailQuery(), peoplePage: 1, peopleSize: 10, agentPage: 2, agentSize: 10 } });
    const blob = JSON.stringify(view);
    expect(blob).not.toMatch(/oneOff|one_off|compMark|补偿标记|离职类型/);
    expect(view.agentsPage.page).toBeLessThanOrEqual(2);
    expect(view.agentsPage.rows.length).toBeLessThanOrEqual(10);
  });

  it("Agent 默认按全年成本从高到低，也可以改按名称或生效日", () => {
    const all = pageAgents(agents, { ...defaultDetailQuery(), agentSize: 50 }, { exact: true });
    const byCost = [...agents].sort((left, right) => right.yearCost - left.yearCost || left.name.localeCompare(right.name, "zh"));
    expect(all.sort).toBe("cost");
    expect(all.rows.map((row) => row.id)).toEqual(byCost.slice(0, all.rows.length).map((line) => line.id));
    expect(all.counts.全部).toBe(all.counts.在用无变动 + all.counts.待新增 + all.counts["待扩容或调整"] + all.counts.待下线);
    const named = pageAgents(agents, { ...defaultDetailQuery(), agentSort: "name", agentSize: 50 }, { exact: true });
    const byName = [...agents].sort((left, right) => left.departmentName.localeCompare(right.departmentName, "zh") || left.name.localeCompare(right.name, "zh"));
    expect(named.rows.map((row) => row.id)).toEqual(byName.map((line) => line.id));
    const transit = pageAgents(agents, { ...defaultDetailQuery(), agentStatuses: ["在途"], agentSort: "effective", agentSize: 50 }, { exact: true });
    expect(transit.sort).toBe("effective");
    const dates = transit.rows.map((row) => row.effectiveDate);
    expect(dates).toEqual([...dates].sort((left, right) => (left || "9999").localeCompare(right || "9999")));
    expect(transit.counts.在途).toBe(transit.counts.待新增 + transit.counts["待扩容或调整"] + transit.counts.待下线);
  });

  it("行数口径：外包合并进括号，行数等于编制时不写计", () => {
    const company = collectPersonLines(result, DEPT.center);
    const all = pagePeople(company, { ...defaultDetailQuery(), peopleSize: 10 }, { exact: true, companyScope: true });
    expect(all.counts).toMatchObject({ 全部: 545, 在岗无变动: 523, 待入职: 11, 待转入: 2, 待离职: 7, 待转出: 2 });
    expect(all.displayRows).toBe(521);
    expect(all.counted).toBe(545);
    expect(all.pageCount).toBe(53);
    expect(all.footer).toBe("共 521 行，计 545（外包 29 个座位合并为 5 行；2 人内部转岗各占两行，实际 543 人）");
    expect(all.summaryHead).toBe("521 行，计 545");
    expect(peopleRosterSummary(all, { exact: true, showMarks: true })).toMatch(/^521 行，计 545 · 在岗无变动 523 · /);
    const transit = pagePeople(company, { ...defaultDetailQuery(), peopleStatuses: ["在途"], peopleSize: 50 }, { exact: true, companyScope: true });
    expect(transit.footer).toBe("共 22 行（2 人内部转岗各占两行，实际 20 人）");
    expect(transit.summaryHead).toBe("22 行");
    expect(peopleRosterSummary(transit, { exact: true, showMarks: false })).toMatch(/^22 行 · 在岗无变动 /);
    const plat = pagePeople(people, { ...defaultDetailQuery(), peopleSize: 10 }, { exact: true });
    expect(plat.footer).toBe("共 69 行，计 72（外包 4 个座位合并为 1 行）");
    expect(plat.summaryHead).toBe("69 行，计 72");
    const infra = pagePeople(collectPersonLines(result, DEPT.infra), { ...defaultDetailQuery(), peopleSize: 50 }, { exact: true });
    expect(infra.footer).toBe("共 36 行，计 39（外包 4 个座位合并为 1 行）");
    const prod = pagePeople(collectPersonLines(result, DEPT.prod1), { ...defaultDetailQuery(), peopleSize: 10 }, { exact: true });
    expect(prod.counts).toMatchObject({ 全部: 164, 在岗无变动: 157, 待入职: 4, 待转入: 0, 待离职: 3, 待转出: 0 });
    expect(prod.displayRows).toBe(159);
    expect(prod.pageCount).toBe(16);
    expect(prod.footer).toBe("共 159 行，计 164（外包 6 个座位合并为 1 行）");
    expect(prod.summaryHead).toBe("159 行，计 164");
    expect(peopleRosterSummary(prod, { exact: true, showMarks: false })).toMatch(/^159 行，计 164 · 在岗无变动 157 · /);
    expect(pagePeople(collectPersonLines(result, DEPT.prod2), { ...defaultDetailQuery(), peopleSize: 10 }, { exact: true }).footer).toBe("共 138 行，计 142（外包 5 个座位合并为 1 行）");
    expect(pagePeople(collectPersonLines(result, DEPT.qa), { ...defaultDetailQuery(), peopleSize: 10 }, { exact: true }).footer).toBe("共 83 行，计 94（外包 12 个座位合并为 1 行）");
    expect(pagePeople(collectPersonLines(result, DEPT.ai), { ...defaultDetailQuery(), peopleSize: 10 }, { exact: true }).footer).toBe("共 71 行，计 72（外包 2 个座位合并为 1 行）");
    expect(pagePeople(collectPersonLines(result, DEPT.data), { ...defaultDetailQuery(), peopleSize: 50 }, { exact: true }).footer).toBe("共 30 人");
    expect(pagePeople(collectPersonLines(result, DEPT.direct), { ...defaultDetailQuery(), peopleSize: 10 }, { exact: true }).footer).toBe("共 1 人");
    expect(pagePeople(collectPersonLines(result, DEPT.prod1), { ...defaultDetailQuery(), peopleStatuses: ["在途"], peopleSize: 50 }, { exact: true }).footer).toBe("共 7 人");
    for (const lines of [company, people, collectPersonLines(result, DEPT.prod1)]) {
      for (const type of [undefined, "正式", "外包", "实习", "顾问"] as const) {
        const page = pagePeople(lines, { ...defaultDetailQuery(), peopleTypes: type ? [type] : [], peopleSize: 10 }, { exact: true });
        expect(page.counts.全部).toBe(page.counts.在岗无变动 + page.counts.待入职 + page.counts.待转入 + page.counts.待离职 + page.counts.待转出);
      }
    }
    const leader = buildLeaderView(result, DEPT.plat, { exact: false, detail: { ...defaultDetailQuery(), peopleStatuses: ["在途"], peopleSize: 50 } });
    expect(leader.people.footer).toBe("共 6 人");
    expect(leader.people.summaryHead).toBe("6 人");
    expect(leader.people.summary?.year).toBe("+24.5");
    expect(leader.transitNote).toBe("加 Agent 在途 3 项 +14.0 万 = 全部在途 9 笔 +38.5 万");
    expect(JSON.stringify(leader.people)).not.toContain("质量与交付部");
    expect(JSON.stringify(leader.people)).not.toContain("数据智能部");
    expect(leader.agentsPage.counts).toMatchObject({ 全部: 4, 在用无变动: 1, 在途: 3, 待新增: 1, "待扩容或调整": 1, 待下线: 1 });
  });

  it("外包汇总行带座位说明，实习和正式行没有", () => {
    expect(TOOLTIPS).toHaveLength(55);
    expect(OUTSOURCE_SEAT_NOTE).toBe("外包只有座位数，按部门汇总，不列姓名");
    const company = collectPersonLines(result, DEPT.center);
    const seats = pagePeople(company, { ...defaultDetailQuery(), peopleTypes: ["外包"], peopleSize: 50 }, { exact: true });
    expect(seats.rows.length).toBeGreaterThan(0);
    expect(seats.rows.every((row) => row.name.startsWith("外包（") && row.nameNote === OUTSOURCE_SEAT_NOTE)).toBe(true);
    for (const type of ["正式", "实习", "顾问"] as const) {
      const others = pagePeople(company, { ...defaultDetailQuery(), peopleTypes: [type], peopleSize: 50 }, { exact: true });
      expect(others.rows.length).toBeGreaterThan(0);
      expect(others.rows.every((row) => row.nameNote == null)).toBe(true);
    }
  });

  it("每个范围、状态和用工类型：编制等于芯片，行数等于渲染，计只在不相等时出现", () => {
    const scopes = [DEPT.center, DEPT.direct, DEPT.prod1, DEPT.prod2, DEPT.plat, DEPT.platDirect, DEPT.infra, DEPT.data, DEPT.qa, DEPT.ai];
    const statuses = [[], ["在岗无变动"], ["在途"], ["待入职"], ["待转入"], ["待离职"], ["待转出"]];
    const types = [[], ["正式"], ["外包"], ["实习"], ["顾问"]];
    const chipSum = (counts: PeopleCounts, selected: string[]) => {
      if (selected.length === 0) return counts.全部;
      if (selected.length === 1 && selected[0] === "在途") return counts.在途;
      if (selected[0] === "在岗无变动") return counts.在岗无变动;
      return counts[selected[0] as keyof PeopleCounts];
    };
    let checks = 0;
    for (const scope of scopes) {
      const lines = collectPersonLines(result, scope);
      for (const status of statuses) {
        for (const type of types) {
          const query = { ...defaultDetailQuery(), peopleStatuses: status, peopleTypes: type, peopleSize: 10 as const };
          const page = pagePeople(lines, query, { exact: true });
          let rendered = 0;
          for (let index = 1; index <= page.pageCount; index += 1) {
            rendered += pagePeople(lines, { ...query, peoplePage: index }, { exact: true }).rows.length;
          }
          expect(page.counted).toBe(chipSum(page.counts, status));
          expect(page.displayRows).toBe(rendered);
          const equal = page.displayRows === page.counted;
          expect(page.footer.includes("计")).toBe(!equal);
          expect(page.summaryHead.includes("计")).toBe(!equal);
          checks += 3;
        }
      }
    }
    expect(checks).toBe(scopes.length * statuses.length * types.length * 3);
  });

  it("公司在途金额按未取整加总后再取整", () => {
    const company = collectPersonLines(result, DEPT.center);
    const transit = pagePeople(company, { ...defaultDetailQuery(), peopleStatuses: ["在途"], peopleSize: 50 }, { exact: true });
    const agents = collectAgentLines(result, DEPT.center).filter((line) => line.status !== "在用");
    const agentYuan = agents.reduce((total, line) => total + (line.yearImpact ?? 0), 0);
    expect(transit.summary?.count).toBe(22);
    expect(transit.summary?.yearYuan).toBeCloseTo(1_518_808.22, 2);
    expect(agents).toHaveLength(5);
    expect(agentYuan).toBeCloseTo(222_575.34, 2);
    expect((transit.summary?.yearYuan ?? 0) + agentYuan).toBeCloseTo(1_741_383.56, 2);
    const view = buildLeaderView(result, DEPT.center, { exact: true, detail: { ...defaultDetailQuery(), peopleStatuses: ["在途"], peopleSize: 50 } });
    expect(view.transitNote).toBe("加 Agent 在途 5 项 +22.5 万 = 全部在途 27 笔 +174.0 万");
  });
});
