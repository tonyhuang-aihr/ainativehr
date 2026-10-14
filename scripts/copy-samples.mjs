import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "sample-data");
const target = path.join(root, "public", "sample-data");

if (!fs.existsSync(source)) {
  console.error("缺少 sample-data/。请先运行 npm run generate:samples");
  process.exit(1);
}
fs.mkdirSync(target, { recursive: true });
for (const name of fs.readdirSync(source)) {
  if (name.startsWith(".")) continue;
  fs.copyFileSync(path.join(source, name), path.join(target, name));
}
console.log(`已复制示例数据到 public/sample-data（${fs.readdirSync(target).length} 个文件）`);
