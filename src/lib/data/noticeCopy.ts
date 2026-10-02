/** 第一步没有服务器。措辞按 PRD v0.6 版本 A，不写「不留存」「不用于训练」。 */

export const DATA_NOTICE_TITLE = "数据怎么保存";

export const PROVIDER_TERMS = [
  { name: "DeepSeek 隐私政策", href: "https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html" },
  { name: "智谱 GLM 隐私政策", href: "https://open.bigmodel.cn/dev/howuse/privacypolicy" },
  { name: "Kimi（月之暗面）隐私政策", href: "https://www.moonshot.cn/privacy" },
];

export const DATA_NOTICE_LEAD =
  "目前所有数据只存在你的浏览器里，不会上传到服务器。花名册、姓名、工号、薪酬、绩效和负责人卡片都留在这台浏览器。";

export const DATA_NOTICE_LLM =
  "调用大模型时，只会发送脱敏后的汇总（部门、人数、层级、岗位和指标），不含姓名和工号。少于 5 人的部门不报具体人数。DeepSeek、智谱 GLM 和 Kimi 按各自公布的协议处理这些汇总，可能在一定期限内留存；部分条款允许在去标识化之后用于模型优化或训练。哪家提供不留存选项，我们会另行申请开通，并以服务商的书面确认为准。企业可以要求关闭某一家。";

export const DATA_NOTICE_NOW =
  "方案共享和审批还没开通，现在没有要清除的服务器数据。换设备前请导出场景文件。设置里有完整说明，也可以一键清空这台浏览器里的本地数据。";

export const DATA_PAGE_EXTRA = [
  "本地保存的键包括花名册和方案（ainativehr.workspace.v1）、协作视图开关、手机编辑提示，以及你是否已经看过这段说明。",
  "导出的「组织沙盘-场景.json」带上决策轨迹。决策轨迹只写结构变化和角色（例如 HRBP、CTO），不写姓名、工号和人员安置。",
  "一键清空会删掉上述本地数据，清完后这段说明会再出现一次。服务器上的一键清除和邮件通知要等账号和数据库做好再做，现在没有那一部分。",
];

export function noticePlainText(): string {
  return [DATA_NOTICE_TITLE, DATA_NOTICE_LEAD, DATA_NOTICE_LLM, DATA_NOTICE_NOW, ...DATA_PAGE_EXTRA, ...PROVIDER_TERMS.map((item) => item.name)].join("\n");
}
