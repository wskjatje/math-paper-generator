import { describe, expect, it } from "vitest";
import { toUserFacingErrorMessage } from "./userFacingError.shared";

describe("toUserFacingErrorMessage", () => {
  it("maps figure_scene errors", () => {
    expect(
      toUserFacingErrorMessage("第 1 题：缺少可校验的 figure_scene（pending://figure）"),
    ).toMatch(/配图/);
  });

  it("maps duplicate submit", () => {
    expect(toUserFacingErrorMessage("你已提交过该作业，不能重复提交")).toMatch(/已提交/);
  });

  it("keeps short unknown messages", () => {
    expect(toUserFacingErrorMessage("自定义业务错误")).toBe("自定义业务错误");
  });

  it("maps Interactions API incompatibility", () => {
    expect(
      toUserFacingErrorMessage(
        "HTTP 400: This model only supports Interactions API. INVALID_ARGUMENT",
      ),
    ).toMatch(/接口不兼容|设置|模型/);
  });

  it("maps MySQL / path jargon to storage guidance", () => {
    expect(
      toUserFacingErrorMessage(
        "当前无法持久化：未配置 Supabase，MySQL 不可用，且目录 data/local-exams 不可写。",
      ),
    ).toMatch(/保存位置|设置/);
  });

  it("maps MPG_ listening TTS env jargon", () => {
    expect(
      toUserFacingErrorMessage(
        "听力云端 TTS 配置不完整：请同时设置 MPG_LISTENING_TTS_BASE_URL",
      ),
    ).toMatch(/听力|语音/);
  });

  it("maps auth errors separately from model mismatch", () => {
    expect(toUserFacingErrorMessage("HTTP 401 unauthorized")).toMatch(/密钥|登录/);
  });

  it("maps LOVABLE / .env 技术提示为旧版白话", () => {
    expect(
      toUserFacingErrorMessage(
        "服务端未检测到 LOVABLE_API_KEY。请在部署环境或项目根目录 `.env` / `.dev.vars` 中配置，或改用本地模型。",
      ),
    ).toBe("云端 AI 尚未配置，请到设置改用本机 AI，或请管理员配置云端服务");
  });
});
