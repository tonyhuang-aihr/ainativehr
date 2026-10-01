import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "sample-data");
fs.mkdirSync(outDir, { recursive: true });

const LEVEL_COST = {
  CXO: 2200000,
  M4: 1400000,
  M3: 980000,
  M2: 760000,
  M1: 520000,
  P7: 480000,
  P6: 340000,
  P5: 240000,
};

const SURNAMES = ["李", "王", "张", "刘", "陈", "杨", "黄", "赵", "吴", "周", "徐", "孙", "马", "朱", "胡", "郭", "何", "高", "林", "罗", "郑", "梁", "谢", "宋", "唐", "许", "邓", "冯", "曹", "彭", "曾", "肖", "田", "董", "潘", "袁", "蔡", "蒋", "余", "杜", "叶", "程", "魏", "苏", "吕", "丁", "任", "沈", "姚", "卢", "傅", "钟", "姜", "崔", "谭", "陆", "汪", "范", "廖", "石", "金", "韦", "贾", "夏", "付", "方", "邹", "熊", "白", "孟", "秦", "邱", "侯", "江", "尹", "薛", "阎", "段", "雷", "黎", "史", "龙", "陶", "贺", "顾", "毛", "郝", "龚", "邵", "万", "钱", "严", "赖", "覃", "洪", "武"];
const GIVEN = ["子轩", "雨桐", "浩然", "欣怡", "俊杰", "思远", "嘉琪", "明哲", "婉清", "博文", "语桐", "安然", "一诺", "清越", "景行", "书衡", "明川", "舒然", "嘉树", "向晚", "予怀", "敬之", "照野", "青禾", "未央", "言蹊", "怀瑾", "北辰", "清妍", "念初", "知微", "行知", "望舒", "听白", "疏桐", "晏清", "以宁", "晚晴", "知行", "承志", "星河", "清和", "予安", "南舟", "秋白"];

const C = "星澜科技";
const RD = `${C}/研发中心`;
const PLAT = `${RD}/平台部`;
const DATA = `${PLAT}/数据组`;
const METRIC = `${DATA}/指标平台组`;
const COLLECT = `${METRIC}/采集小组`;
const RT = `${COLLECT}/实时链路小组`;
const ARCH = `${PLAT}/基础架构组`;
const EFF = `${PLAT}/研发效能组`;
const D1 = `${RD}/产品研发一部`;
const D2 = `${RD}/产品研发二部`;
const QA = `${RD}/质量与交付部`;
const AI = `${RD}/数据智能部`;
const PROD = `${C}/产品中心`;
const BIZ = `${C}/商业化中心`;
const FUNC = `${C}/职能中心`;

const people = [];
const used = new Set();
let serial = 1000;

function add({ name, dept, title, manager = "", level }) {
  if (used.has(name)) throw new Error(`重名：${name}`);
  used.add(name);
  serial += 1;
  const annual = LEVEL_COST[level] + (people.length % 7) * 6000;
  const locations = ["上海", "杭州", "北京", "深圳", "成都"];
  const month = String((people.length % 12) + 1).padStart(2, "0");
  const year = 2016 + (people.length % 9);
  people.push({
    name,
    dept,
    title,
    manager,
    level,
    employeeId: `E${serial}`,
    annual,
    hireDate: `${year}-${month}-01`,
    location: locations[people.length % locations.length],
  });
  return name;
}

let givenCursor = 0;
function nextName() {
  for (let i = 0; i < SURNAMES.length * GIVEN.length; i += 1) {
    const surname = SURNAMES[Math.floor(givenCursor / GIVEN.length) % SURNAMES.length];
    const given = GIVEN[givenCursor % GIVEN.length];
    givenCursor += 1;
    const name = `${surname}${given}`;
    if (!used.has(name)) return name;
  }
  throw new Error("名字用完了");
}

function addIcs({ manager, dept, title, level, count }) {
  for (let i = 0; i < count; i += 1) add({ name: nextName(), dept, title, manager, level });
}

add({ name: "陈启明", dept: C, title: "首席执行官", level: "CXO" });
add({ name: "周衡", dept: RD, title: "首席技术官", manager: "陈启明", level: "CXO" });
add({ name: "林知夏", dept: PLAT, title: "平台总监", manager: "周衡", level: "M3" });
add({ name: "赵启年", dept: DATA, title: "数据组长", manager: "林知夏", level: "M1" });
add({ name: "孙澄", dept: METRIC, title: "指标平台组长", manager: "赵启年", level: "M1" });
add({ name: "吴岚", dept: COLLECT, title: "采集组长", manager: "孙澄", level: "M1" });
add({ name: "郑一楠", dept: RT, title: "实时链路组长", manager: "吴岚", level: "M1" });
add({ name: "韩砺", dept: ARCH, title: "基础架构组长", manager: "林知夏", level: "M1" });
add({ name: "曹敏", dept: EFF, title: "研发效能组长", manager: "林知夏", level: "M1" });
add({ name: "梁秋白", dept: D1, title: "研发一部总监", manager: "周衡", level: "M3" });
add({ name: "谢予白", dept: `${D1}/前端组`, title: "前端组长", manager: "梁秋白", level: "M1" });
add({ name: "邓行止", dept: `${D1}/后端组`, title: "后端组长", manager: "梁秋白", level: "M1" });
add({ name: "傅望舒", dept: `${D1}/移动组`, title: "移动组长", manager: "梁秋白", level: "M1" });
add({ name: "宋知远", dept: D2, title: "研发二部总监", manager: "周衡", level: "M3" });
add({ name: "潘清越", dept: `${D2}/交易组`, title: "交易组长", manager: "宋知远", level: "M1" });
add({ name: "魏晏如", dept: `${D2}/增长组`, title: "增长组长", manager: "宋知远", level: "M1" });
add({ name: "姜疏影", dept: `${D2}/商家组`, title: "商家组长", manager: "宋知远", level: "M1" });
add({ name: "马修远", dept: QA, title: "质量与交付负责人", manager: "周衡", level: "M2" });
add({ name: "顾清和", dept: AI, title: "数据智能负责人", manager: "周衡", level: "M3" });
add({ name: "罗景行", dept: `${AI}/算法组`, title: "算法组长", manager: "顾清和", level: "M1" });
add({ name: "裴晓", dept: `${AI}/应用组`, title: "应用组长", manager: "顾清和", level: "M1" });
add({ name: "许南舟", dept: PROD, title: "产品副总裁", manager: "陈启明", level: "CXO" });
add({ name: "叶晚", dept: `${PROD}/设计组`, title: "设计组长", manager: "许南舟", level: "M1" });
add({ name: "丁可", dept: `${PROD}/产品运营组`, title: "产品运营组长", manager: "许南舟", level: "M1" });
add({ name: "沈觅", dept: `${PROD}/商业产品组`, title: "商业产品组长", manager: "许南舟", level: "M1" });
add({ name: "江晚吟", dept: BIZ, title: "商业化副总裁", manager: "陈启明", level: "CXO" });
add({ name: "唐以安", dept: `${BIZ}/销售部`, title: "销售经理", manager: "江晚吟", level: "M2" });
add({ name: "何清", dept: `${BIZ}/客户成功部`, title: "客户成功负责人", manager: "江晚吟", level: "M2" });
add({ name: "苏小满", dept: `${BIZ}/市场部`, title: "市场经理", manager: "江晚吟", level: "M2" });
add({ name: "韩舒", dept: FUNC, title: "职能负责人", manager: "陈启明", level: "M4" });
add({ name: "陆晚宁", dept: `${FUNC}/人力资源部`, title: "人力资源经理", manager: "韩舒", level: "M2" });
add({ name: "冯既白", dept: `${FUNC}/财务部`, title: "财务经理", manager: "韩舒", level: "M2" });
add({ name: "秦牧之", dept: `${FUNC}/法务部`, title: "法务经理", manager: "韩舒", level: "M2" });
add({ name: "姚之远", dept: `${FUNC}/总经理办公室`, title: "总办主任", manager: "韩舒", level: "M2" });
add({ name: "沈予安", dept: `${C}/战略部`, title: "战略负责人", manager: "陈启明", level: "M3" });

addIcs({ manager: "赵启年", dept: DATA, title: "数据工程师", level: "P6", count: 2 });
addIcs({ manager: "孙澄", dept: METRIC, title: "指标工程师", level: "P6", count: 2 });
addIcs({ manager: "吴岚", dept: COLLECT, title: "数据采集工程师", level: "P6", count: 2 });
addIcs({ manager: "郑一楠", dept: RT, title: "实时数据工程师", level: "P6", count: 3 });
addIcs({ manager: "韩砺", dept: ARCH, title: "基础架构工程师", level: "P6", count: 4 });
addIcs({ manager: "曹敏", dept: EFF, title: "效能工程师", level: "P6", count: 3 });
addIcs({ manager: "谢予白", dept: `${D1}/前端组`, title: "前端工程师", level: "P6", count: 3 });
addIcs({ manager: "邓行止", dept: `${D1}/后端组`, title: "后端工程师", level: "P7", count: 3 });
addIcs({ manager: "傅望舒", dept: `${D1}/移动组`, title: "移动工程师", level: "P6", count: 3 });
addIcs({ manager: "潘清越", dept: `${D2}/交易组`, title: "交易开发工程师", level: "P6", count: 3 });
addIcs({ manager: "魏晏如", dept: `${D2}/增长组`, title: "增长开发工程师", level: "P6", count: 3 });
addIcs({ manager: "姜疏影", dept: `${D2}/商家组`, title: "商家开发工程师", level: "P5", count: 3 });
add({ name: nextName(), dept: QA, title: "测试工程师", manager: "马修远", level: "P6" });
add({ name: nextName(), dept: QA, title: "交付专员", manager: "马修远", level: "P6" });
addIcs({ manager: "顾清和", dept: AI, title: "数据产品专员", level: "P6", count: 2 });
addIcs({ manager: "罗景行", dept: `${AI}/算法组`, title: "算法工程师", level: "P7", count: 3 });
addIcs({ manager: "裴晓", dept: `${AI}/应用组`, title: "应用工程师", level: "P6", count: 3 });
addIcs({ manager: "叶晚", dept: `${PROD}/设计组`, title: "产品设计师", level: "P6", count: 3 });
addIcs({ manager: "丁可", dept: `${PROD}/产品运营组`, title: "产品运营", level: "P6", count: 3 });
addIcs({ manager: "沈觅", dept: `${PROD}/商业产品组`, title: "产品经理", level: "P7", count: 4 });
addIcs({ manager: "唐以安", dept: `${BIZ}/销售部`, title: "销售顾问", level: "P6", count: 5 });
addIcs({ manager: "何清", dept: `${BIZ}/客户成功部`, title: "客户成功顾问", level: "P6", count: 12 });
addIcs({ manager: "苏小满", dept: `${BIZ}/市场部`, title: "市场专员", level: "P5", count: 3 });
addIcs({ manager: "陆晚宁", dept: `${FUNC}/人力资源部`, title: "人力资源专员", level: "P5", count: 4 });
addIcs({ manager: "冯既白", dept: `${FUNC}/财务部`, title: "财务专员", level: "P6", count: 3 });
addIcs({ manager: "秦牧之", dept: `${FUNC}/法务部`, title: "法务专员", level: "P6", count: 3 });
addIcs({ manager: "姚之远", dept: `${FUNC}/总经理办公室`, title: "行政专员", level: "P5", count: 3 });

function spanOf(name) {
  return people.filter((person) => person.manager === name).length;
}
function subtree(dept) {
  return people.filter((person) => person.dept === dept || person.dept.startsWith(`${dept}/`)).length;
}
const wide = people.filter((person) => spanOf(person.name) > 8);
const narrow = people.filter((person) => {
  const span = spanOf(person.name);
  return span >= 1 && span <= 2;
});
if (wide.length !== 1 || wide[0].name !== "何清" || spanOf("何清") !== 12) {
  throw new Error(`幅度过宽不符合设计：${wide.map((person) => `${person.name}:${spanOf(person.name)}`).join(",")}`);
}
if (narrow.length !== 1 || narrow[0].name !== "马修远" || spanOf("马修远") !== 2) {
  throw new Error(`幅度过窄不符合设计：${narrow.map((person) => `${person.name}:${spanOf(person.name)}`).join(",")}`);
}
const maxDepth = Math.max(...people.map((person) => person.dept.split("/").length));
if (maxDepth !== 7) throw new Error(`层级不是 7：${maxDepth}`);
const allPaths = new Set();
for (const person of people) {
  const parts = person.dept.split("/");
  for (let i = 1; i <= parts.length; i += 1) allPaths.add(parts.slice(0, i).join("/"));
}
const singles = [...allPaths].filter((dept) => subtree(dept) === 1);
if (singles.length !== 1 || !singles[0].endsWith("战略部")) {
  throw new Error(`一人部门不符合设计：${singles.join(" | ")}`);
}
if (people.length < 110 || people.length > 140) throw new Error(`人数 ${people.length} 不在 110-140`);
for (const person of people) {
  if (person.manager && !used.has(person.manager)) throw new Error(`上级不存在 ${person.manager}`);
}

const cleanHeaders = ["姓名", "部门", "岗位", "直属上级", "工号", "职级", "年度人力成本", "入职时间", "工作地点"];
const cleanRows = people.map((person) => [
  person.name,
  person.dept,
  person.title,
  person.manager,
  person.employeeId,
  person.level,
  person.annual,
  person.hireDate,
  person.location,
]);

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function writeCsv(filename, headers, rows) {
  const body = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  fs.writeFileSync(path.join(outDir, filename), `\uFEFF${body}\n`, "utf8");
}
function writeXlsx(filename, sheets) {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    ws["!cols"] = sheet.headers.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(book, ws, sheet.name);
  }
  XLSX.writeFile(book, path.join(outDir, filename));
}

writeCsv("01-星澜科技-花名册.csv", cleanHeaders, cleanRows);
writeXlsx("01-星澜科技-花名册.xlsx", [{ name: "花名册", headers: cleanHeaders, rows: cleanRows }]);

const messy = [
  ["陈建国", "凌川贸易", "总经理", "", "LC001", "总经办"],
  ["刘芳", "销售部", "销售总监", "陈建国", "LC002", "销售"],
  ["张伟", "销售部", "销售经理", "刘芳", "LC003", "销售"],
  ["黄丽", "销售部", "销售专员", "刘芳", "LC004", "销售"],
  ["徐强", "销售部", "销售专员", "刘芳", "LC005", "销售"],
  ["周凯", "销售部", "销售助理", "张伟", "LC006", "销售，上级只写了张伟"],
  ["赵强", "仓储部", "仓储总监", "陈建国", "LC007", "仓储"],
  ["张伟", "仓储部", "仓储主管", "赵强", "LC008", "和销售部张伟重名"],
  ["马丽", "仓储部", "仓管员", "赵强", "LC009", "仓储"],
  ["胡兵", "仓储部", "仓管员", "赵强", "LC010", "仓储"],
  ["孙婷", "市场部", "市场经理", "陈建国", "LC011", "市场"],
  ["周宁", "市场部", "市场专员", "钱多多", "LC012", "上级钱多多不在表里"],
  ["王磊", "渠道部", "渠道经理", "李娜", "LC013", "和李娜互相汇报"],
  ["李娜", "渠道部", "渠道主管", "王磊", "LC014", "和王磊互相汇报"],
  ["高峰", "渠道部", "渠道专员", "王磊", "LC015", "渠道"],
  ["吴霞", "财务部", "财务经理", "陈建国", "LC016", "财务"],
  ["郑浩", "财务部", "会计", "吴霞", "LC017", "财务"],
  ["冯雪", "财务部", "出纳", "吴霞", "LC018", "财务"],
  ["陈静", "人力资源部", "人力资源经理", "陈建国", "LC019", "人力资源"],
  ["林峰", "人力资源部", "招聘专员", "陈静", "LC020", "人力资源"],
  ["何敏", "凌川贸易", "行政专员", "陈建国", "LC021", "总经办"],
  ["郭亮", "采购部", "采购专员", "陈建国", "LC022", "采购"],
];

const messyHeaders = ["员工姓名", "组织单元", "担任岗位", "汇报人", "工号", "备注"];
writeCsv("02-凌川贸易-混乱花名册.csv", messyHeaders, messy);

const feishuRows = messy.map((row, index) => [
  row[0],
  `ou_demo_${String(index + 1).padStart(3, "0")}`,
  row[1],
  row[2],
  row[3],
  row[4],
  `user${String(index + 1).padStart(3, "0")}@lingchuan.example`,
  `1380001${String(index + 1).padStart(4, "0")}`,
  index % 2 === 0 ? "上海" : "杭州",
  `2021-${String((index % 12) + 1).padStart(2, "0")}-15`,
  "正式",
  "在职",
]);
const deptSheet = [
  ["凌川贸易", "", "D00"],
  ["销售部", "凌川贸易", "D01"],
  ["仓储部", "凌川贸易", "D02"],
  ["市场部", "凌川贸易", "D03"],
  ["渠道部", "凌川贸易", "D04"],
  ["财务部", "凌川贸易", "D05"],
  ["人力资源部", "凌川贸易", "D06"],
  ["采购部", "凌川贸易", "D07"],
];
writeXlsx("03-凌川贸易-飞书通讯录导出.xlsx", [
  {
    name: "部门列表",
    headers: ["部门名称", "上级部门", "部门ID"],
    rows: deptSheet,
  },
  {
    name: "成员列表",
    headers: ["姓名", "用户 ID", "部门", "职务", "直线经理", "工号", "企业邮箱", "手机号", "城市", "入职日期", "员工类型", "帐号状态"],
    rows: feishuRows,
  },
]);

writeCsv(
  "00-导入模板.csv",
  ["姓名", "部门", "岗位", "直属上级", "工号", "职级", "年度人力成本", "入职时间", "工作地点", "绩效"],
  [["示例员工（导入前请删除）", "示例公司/研发中心/平台部", "后端工程师", "示例负责人", "E0001", "P6", "360000", "2024-03-01", "上海", ""]],
);

console.log(
  `星澜科技 ${people.length} 人，最深 ${maxDepth} 层，何清幅度 ${spanOf("何清")}，马修远幅度 ${spanOf("马修远")}，一人部门 ${singles[0]}`,
);
