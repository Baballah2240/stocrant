const email = process.env.STOCRANT_ADMIN_EMAIL;
const password = process.env.STOCRANT_ADMIN_PASSWORD;
const baseUrl = (process.env.STOCRANT_TEST_BASE_URL || "http://127.0.0.1:3000").trim().replace(/\/+$/, "");

if (!email || !password) throw new Error("STOCRANT_ADMIN_EMAIL and STOCRANT_ADMIN_PASSWORD must be set.");

const response = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});

const body = await response.text();
console.log(JSON.stringify({ status: response.status, ok: response.ok, body }, null, 2));
if (!response.ok) process.exitCode = 1;