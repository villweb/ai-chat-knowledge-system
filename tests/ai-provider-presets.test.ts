import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBaseUrl, resolvePresetId } from "../app/desktop/ai-provider-presets";

test("resolvePresetId prefers saved preset", () => {
  assert.equal(resolvePresetId("openai-compatible", "https://api.openai.com/v1", "deepseek"), "deepseek");
});

test("resolvePresetId maps fixture provider", () => {
  assert.equal(resolvePresetId("fixture", "", ""), "fixture");
});

test("resolvePresetId infers preset from base url", () => {
  assert.equal(resolvePresetId("openai-compatible", "https://api.deepseek.com/v1/", ""), "deepseek");
});

test("resolvePresetId falls back to custom for unknown url", () => {
  assert.equal(resolvePresetId("openai-compatible", "https://relay.example.com/v1", ""), "custom");
});

test("normalizeBaseUrl trims trailing slash", () => {
  assert.equal(normalizeBaseUrl("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1");
});
