import type { SheetTable } from "@/lib/model/types";

export type DataOrigin =
  | { type: "upload"; filename: string }
  | { type: "paste" }
  | { type: "sample"; sampleId: string; label: string }
  | { type: "hris"; vendor: HrisVendor };

export type HrisVendor = "feishu" | "dingtalk" | "wecom";

export type LoadedRoster = {
  filename: string;
  sheets: SheetTable[];
  origin: DataOrigin;
};

/**
 * 花名册来源。本期实现文件、粘贴和示例数据。
 * 飞书 / 钉钉 / 企微 HRIS 走同一个接口，二期只换实现，不改导入页和架构算法。
 */
export interface RosterSource {
  id: string;
  label: string;
  description: string;
  load(): Promise<LoadedRoster>;
}

export function createHrisRosterSource(vendor: HrisVendor): RosterSource {
  const label = { feishu: "飞书", dingtalk: "钉钉", wecom: "企业微信" }[vendor];
  return {
    id: `hris-${vendor}`,
    label: `${label}通讯录`,
    description: "二期再接组织架构接口。本期请用 Excel 或导出的表格。",
    async load() {
      throw new Error(`${label}组织接口将在二期接入。本期请上传导出的花名册，或先用示例数据。`);
    },
  };
}
