import { test, expect } from "@playwright/test";
import OpenAI from "openai";
import { friendlyError, validateApiBaseUrl } from "../lib/ai";

test("API base URL rejects combined protocols and full operation paths", () => {
  const root = "https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1";
  expect(validateApiBaseUrl(root + "/")).toBe(root);
  expect(validateApiBaseUrl(undefined)).toBeUndefined();
  expect(validateApiBaseUrl(" ")).toBeUndefined();
  for (const separator of ["；", ";", " "]) {
    expect(() => validateApiBaseUrl(root + separator + "https://token-plan.maas.qianwenaiapi.com/apps/anthropic")).toThrow("只能填写一个接口根地址");
  }
  for (const operation of ["/responses", "/chat/completions"]) {
    expect(() => validateApiBaseUrl(root + operation)).toThrow("根地址");
  }
  expect(() => validateApiBaseUrl("https://token-plan.maas.qianwenaiapi.com/apps/anthropic")).toThrow("Anthropic");
  expect(() => validateApiBaseUrl(root + "?api_key=test")).toThrow("OPENAI_API_KEY");
});

test("provider 404 reports actionable URL and model configuration checks", () => {
  const error = new OpenAI.NotFoundError(404, { message: "Model not exist." }, "Model not exist.", new Headers());
  expect(friendlyError(error)).toContain("OPENAI_BASE_URL");
  expect(friendlyError(error)).toContain("OPENAI_MODEL");
});
