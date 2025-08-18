import { greaseHandler } from "../../src/ext/grease";

describe("GREASE Handler", () => {
  describe("cleanObject", () => {
    it("should remove GREASE fields", () => {
      const obj = {
        valid: "data",
        _reserved_1: "grease",
        _grease_test: "value",
        another: "field",
      };

      const cleaned = greaseHandler.cleanObject(obj);
      expect(cleaned).toEqual({
        valid: "data",
        another: "field",
      });
    });
  });

  describe("addGreaseFields", () => {
    it("should add GREASE fields when enabled", () => {
      process.env.PEAC_GREASE_ENABLED = "true";
      const obj = { data: "value" };
      const result = greaseHandler.addGreaseFields(obj);
      expect(result).toHaveProperty("_grease_test");
      delete process.env.PEAC_GREASE_ENABLED;
    });

    it("should not add GREASE fields when disabled", () => {
      const obj = { data: "value" };
      const result = greaseHandler.addGreaseFields(obj);
      expect(result).not.toHaveProperty("_grease_test");
    });
  });
});