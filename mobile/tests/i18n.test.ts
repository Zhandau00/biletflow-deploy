/// <reference types="node" />
/**
 * Every English text the app wraps in t(), tr(), tk() or t.plural() has a
 * Russian and a Kazakh translation with the same {placeholders}.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ru from "../src/locales/ru.json";
import kk from "../src/locales/kk.json";

const SRC = join(__dirname, "..", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

const STRING = String.raw`"((?:[^"\\]|\\.)*)"`;
const unquote = (s: string) => JSON.parse(`"${s}"`) as string;

function keys() {
  const found = new Map<string, string>();
  for (const file of files(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(new RegExp(String.raw`\b(?:t|tr|tk)\(\s*${STRING}`, "g"))) found.set(unquote(m[1]), file);
    for (const m of src.matchAll(new RegExp(String.raw`\bplural\([^,]+,\s*${STRING},\s*${STRING}`, "g"))) found.set(`${unquote(m[1])}|${unquote(m[2])}`, file);
  }
  return found;
}

const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();

for (const [name, dictionary] of [["Russian", ru], ["Kazakh", kk]] as const) {
  test(`every text has a ${name} translation`, () => {
    const dict = dictionary as Record<string, string>;
    const missing = [...keys()].filter(([key]) => !dict[key]?.trim()).map(([key, file]) => `${key}   (${file.slice(SRC.length + 1)})`);
    assert.deepEqual(missing, [], `${missing.length} missing`);
  });

  test(`${name} translations keep the placeholders`, () => {
    const dict = dictionary as Record<string, string>;
    const wrong = [...keys().keys()]
      .filter((key) => dict[key])
      .flatMap((key) => {
        const english = placeholders(key.replace(/\|/g, " ")).join();
        return dict[key].split("|").filter((form) => placeholders(form).join() !== english && !(key.includes("|") && placeholders(form).every((p) => english.includes(p)))).map((form) => `${key} → ${form}`);
      });
    assert.deepEqual(wrong, []);
  });
}
