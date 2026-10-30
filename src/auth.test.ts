import { expect, test } from "bun:test";
import { passwordMatches, sessionCookie, sessionTokenFrom } from "./auth";

const PASSWORD = "mot-de-passe-de-test-ok";

test("passwordMatches accepte le bon mot de passe seulement", () => {
  expect(passwordMatches(PASSWORD, PASSWORD)).toBe(true);
  expect(passwordMatches("autre", PASSWORD)).toBe(false);
  expect(passwordMatches("", PASSWORD)).toBe(false);
});

test("le jeton de session se relit depuis le cookie, cookie HttpOnly + SameSite", () => {
  const cookie = sessionCookie("abc123", true);
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Strict");
  expect(cookie).toContain("Secure");
  const req = new Request("http://x/api/state", { headers: { cookie: cookie.split(";")[0]! } });
  expect(sessionTokenFrom(req)).toBe("abc123");
  expect(sessionTokenFrom(new Request("http://x/api/state"))).toBe("");
});
