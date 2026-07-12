import { describe, expect, it } from "vitest";
import { examplePath, isMac, modKey } from "./platform";

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const LINUX_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)";

describe("isMac", () => {
  it("macOS の userAgent を mac と判定する", () => {
    expect(isMac(MAC_UA)).toBe(true);
  });
  it("Linux の userAgent は mac ではない", () => {
    expect(isMac(LINUX_UA)).toBe(false);
  });
});

describe("modKey", () => {
  it("mac は Cmd、Linux は Ctrl", () => {
    expect(modKey(MAC_UA)).toBe("Cmd");
    expect(modKey(LINUX_UA)).toBe("Ctrl");
  });
});

describe("examplePath", () => {
  it("mac は Homebrew、Linux は /usr/local/bin を例示する", () => {
    expect(examplePath("quarto", MAC_UA)).toBe("/opt/homebrew/bin/quarto");
    expect(examplePath("quarto", LINUX_UA)).toBe("/usr/local/bin/quarto");
  });
});
