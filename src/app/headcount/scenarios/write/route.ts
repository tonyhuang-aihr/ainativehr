import {
  addScenarioChangeAction,
  copyScenarioAction,
  createScenarioAction,
  deleteScenarioAction,
  importSampleSandboxAction,
  importSandboxFileAction,
  prefillAssumptionsAction,
  renameScenarioAction,
  saveAssumptionsAction,
  toggleScenarioAction,
} from "@/lib/headcount/actions";

/** 场景写入走普通表单 POST。脚本还没加载时，浏览器也能把这一季的变动提交上去。 */
const HANDLERS = {
  create: createScenarioAction,
  rename: renameScenarioAction,
  copy: copyScenarioAction,
  delete: deleteScenarioAction,
  toggle: toggleScenarioAction,
  assumptions: saveAssumptionsAction,
  change: addScenarioChangeAction,
  prefill: prefillAssumptionsAction,
  "import-file": importSandboxFileAction,
  "import-sample": importSampleSandboxAction,
} as const;

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const handler = HANDLERS[intent as keyof typeof HANDLERS];
  if (!handler) return new Response("未知操作", { status: 400 });
  await handler(formData);
  return new Response(null, { status: 204 });
}
