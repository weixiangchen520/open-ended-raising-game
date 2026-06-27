#!/usr/bin/env node
import { hashPassword } from "../auth.js";

const password = process.argv[2] || process.env.STARHARBOR_PASSWORD;
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

console.log(hashPassword(password));
