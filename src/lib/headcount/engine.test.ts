import { describe, expect, it } from "vitest";
import { deptStat, computePlan, subtreeIds } from "@/lib/headcount/engine";
import { formatWan, quarterBand, roundToHalfWan, yearBand } from "@/lib/headcount/money";
import { DEPT, samplePlan } from "@/lib/headcount/sample";

const result = computePlan(samplePlan());
const wan = (yuan: number) => roundToHalfWan(yuan);

describe("示例公司与设计稿数字一致", () => {
  it("编制、在岗、在途按公司去重", () => {
    const center = deptStat(result, DEPT.center);
    expect(center.onBoard).toBe(486);
    expect(center.quotaFormal).toBe(507);
    expect(center.inTransit).toBe(11);
    expect(center.internalTransfers).toBe(2);
    expect(center.occupied).toBe(497);
    expect(center.vacancy).toBe(10);
    expect(center.other).toEqual({ 外包: 29, 实习: 14, 顾问: 3 });
    expect(center.agentInUse).toBe(15);
    expect(center.quotaAgent).toBe(25);
    expect(center.agentInTransit).toBe(7);
    expect(center.agentOffline).toBe(1);
    const summed = result.departments
      .filter((department) => department.parentId === DEPT.center)
      .reduce((total, department) => total + department.inTransit, 0);
    expect(summed).toBe(13);
  });

  it("公司成本合计", () => {
    const center = deptStat(result, DEPT.center);
    expect(formatWan(center.currentYuan)).toBe("15,896.5");
    expect(formatWan(center.inFlightQuarterTotal)).toBe("55.0");
    expect(formatWan(center.inFlightYearTotal)).toBe("198.5");
    expect(formatWan(center.yearTotalYuan)).toBe("16,095.0");
  });

  it("平台部负责人视图用的日常成本", () => {
    const plat = deptStat(result, DEPT.plat);
    expect(plat.onBoard).toBe(62);
    expect(plat.inTransit).toBe(3);
    expect(plat.occupied).toBe(65);
    expect(plat.vacancy).toBe(1);
    expect(plat.agentInUse).toBe(6);
    expect(plat.peopleYearEnd).toBe(62);
    expect(plat.agentYearEnd).toBe(9);
    expect(formatWan(plat.currentYuan)).toBe("2,037.0");
    expect(formatWan(plat.yearDailyYuan)).toBe("2,075.5");
    expect(formatWan(plat.inFlightYearDaily)).toBe("38.5");
    expect(formatWan(plat.yearTotalYuan)).toBe("2,084.0");
    expect(formatWan(plat.inFlightYearTotal)).toBe("47.5");
    expect(formatWan(plat.inFlightQuarterTotal)).toBe("17.5");
    const daily = [0, 1, 2, 3].map(
      (index) => plat.quarterFormal[index] + plat.quarterOther[index] + plat.quarterAgent[index],
    );
    expect(daily.map((value) => wan(value))).toEqual([511, 523, 520.5, 520.5]);
    expect(wan(plat.currentYuan)).toBeLessThanOrEqual(2050);
    expect(wan(plat.yearDailyYuan) - 2050).toBe(25.5);
  });

  it("平台部三个下级的当前成本", () => {
    expect(formatWan(deptStat(result, DEPT.platDirect).currentYuan)).toBe("159.0");
    expect(formatWan(deptStat(result, DEPT.infra).currentYuan)).toBe("1,102.0");
    expect(formatWan(deptStat(result, DEPT.data).currentYuan)).toBe("776.0");
    expect(deptStat(result, DEPT.data).vacancy).toBe(-1);
    expect(deptStat(result, DEPT.infra).vacancy).toBe(2);
    expect(deptStat(result, DEPT.platDirect).onBoard).toBe(2);
  });

  it("部门行与设计稿一致", () => {
    const expectDept = (id: string, fields: { on: number; transit: number; cur: string; year: string }) => {
      const stat = deptStat(result, id);
      expect(stat.onBoard).toBe(fields.on);
      expect(stat.inTransit).toBe(fields.transit);
      expect(formatWan(stat.currentYuan)).toBe(fields.cur);
      expect(formatWan(stat.yearTotalYuan)).toBe(fields.year);
    };
    expectDept(DEPT.prod1, { on: 150, transit: 4, cur: "4,791.0", year: "4,859.0" });
    expectDept(DEPT.prod2, { on: 131, transit: 2, cur: "4,169.0", year: "4,196.5" });
    expectDept(DEPT.qa, { on: 77, transit: 3, cur: "2,547.0", year: "2,587.0" });
    expectDept(DEPT.ai, { on: 65, transit: 1, cur: "2,213.0", year: "2,228.5" });
    expectDept(DEPT.direct, { on: 1, transit: 0, cur: "140.0", year: "140.0" });
  });

  it("在途驱动项按组汇总，不把一次性费用算进日常", () => {
    const ids = subtreeIds(result.plan, DEPT.plat);
    const moves = result.movements.filter((movement) => ids.has(movement.departmentId));
    const joins = moves.filter((movement) => movement.kind === "入职" || movement.kind === "转入");
    const leaves = moves.filter((movement) => movement.kind === "离职" || movement.kind === "转出");
    const agents = moves.filter((movement) => movement.kind.startsWith("Agent"));
    expect(joins).toHaveLength(3);
    expect(leaves).toHaveLength(3);
    expect(formatWan(joins.reduce((total, movement) => total + movement.annual, 0))).toBe("77.0");
    expect(formatWan(leaves.reduce((total, movement) => total + movement.annual, 0))).toBe("−52.5");
    expect(formatWan(agents.reduce((total, movement) => total + movement.annual, 0))).toBe("14.0");
    expect(deptStat(result, DEPT.plat).yearOneOffYuan).toBeGreaterThan(0);
  });

  it("人员行区间：边界归上一档，离职季度没有天就显示横线", () => {
    const zhao = result.people.find((person) => person.name === "赵一");
    const jiang = result.people.find((person) => person.name === "蒋十二");
    const zhu = result.people.find((person) => person.name === "朱十五");
    expect(zhao && yearBand(zhao.annual)).toBe("80–90");
    expect(zhao && zhao.quarters.map((value, index) => quarterBand(value, zhao.days[index]))).toEqual(["17.5–20", "17.5–20", "20–22.5", "20–22.5"]);
    expect(jiang?.status).toBe("待离职");
    expect(jiang && quarterBand(jiang.quarters[1], jiang.days[1])).toBe("—");
    expect(jiang && quarterBand(jiang.quarters[0], jiang.days[0])).toBe("2.5–5");
    expect(zhu && zhu.quarters.map((value, index) => quarterBand(value, zhu.days[index]))).toEqual(["5–7.5", "5–7.5", "7.5–10", "7.5–10"]);
    expect(yearBand(400_000)).toBe("40–50");
    expect(yearBand(300_000)).toBe("30–40");
    expect(quarterBand(25_000, 90)).toBe("2.5–5");
  });
});
