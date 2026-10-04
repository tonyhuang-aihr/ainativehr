import { gzipSync, gunzipSync } from "node:zlib";
import { MAX_COOKIE_CHUNKS, splitCookieValue } from "@/lib/headcount/scenarioState";

const GZIP_PREFIX = "gz.";

export class ScenarioStateTooLarge extends Error {
  constructor() {
    super("场景状态超过浏览器 cookie 上限，这次没有写入");
    this.name = "ScenarioStateTooLarge";
  }
}

/** 先按原文分片。放不下时再压缩。仍然放不下就抛错，不写半截 cookie。 */
export function packScenarioCookie(json: string): string[] {
  const plain = splitCookieValue(Buffer.from(json, "utf8").toString("base64url"));
  if (plain.length <= MAX_COOKIE_CHUNKS) return plain;
  const packed = splitCookieValue(`${GZIP_PREFIX}${gzipSync(Buffer.from(json, "utf8")).toString("base64url")}`);
  if (packed.length > MAX_COOKIE_CHUNKS) throw new ScenarioStateTooLarge();
  return packed;
}

export function unpackScenarioCookie(chunks: readonly string[]): string {
  const joined = chunks.join("");
  if (!joined) return "";
  if (joined.startsWith(GZIP_PREFIX)) return gunzipSync(Buffer.from(joined.slice(GZIP_PREFIX.length), "base64url")).toString("utf8");
  return Buffer.from(joined, "base64url").toString("utf8");
}
