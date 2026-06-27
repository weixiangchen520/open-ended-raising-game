import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findAccount,
  hashPassword,
  loadAccounts,
  parseCookies,
  publicAccount,
  verifyPassword
} from "../auth.js";

test("password hashes verify only the matching password", () => {
  const hash = hashPassword("correct horse battery staple", "fixed-test-salt");

  assert.ok(verifyPassword("correct horse battery staple", hash));
  assert.equal(verifyPassword("wrong password", hash), false);
  assert.equal(verifyPassword("correct horse battery staple", "not-a-hash"), false);
});

test("account config loads public users without exposing password hashes", async () => {
  const dir = join(tmpdir(), `starharbor-auth-${Date.now()}`);
  const file = join(dir, "accounts.json");
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(file, JSON.stringify({
      accounts: [
        {
          id: "test-user",
          login: "Test",
          displayName: "Test User",
          role: "tester",
          passwordHash: hashPassword("secret", "fixed-account-salt")
        }
      ]
    }), "utf8");

    const accounts = await loadAccounts(file);
    const account = findAccount(accounts, "test");
    const visible = publicAccount(account);

    assert.equal(account.id, "test-user");
    assert.ok(verifyPassword("secret", account.passwordHash));
    assert.deepEqual(visible, {
      id: "test-user",
      login: "Test",
      displayName: "Test User",
      role: "tester"
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cookie parser extracts session tokens", () => {
  const cookies = parseCookies("theme=dark; starharbor_session=abc123; other=value");

  assert.equal(cookies.starharbor_session, "abc123");
  assert.equal(cookies.theme, "dark");
});
