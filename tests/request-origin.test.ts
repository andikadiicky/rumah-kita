import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameOrigin } from "../src/lib/request-origin";

test("same-origin mutations use the browser Host despite Next URL normalization", () => {
  const request = { url: "http://localhost:3000/api/household", headers: new Headers({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }) };
  assert.equal(isSameOrigin(request), true);
  request.headers.set("origin", "https://attacker.test");
  assert.equal(isSameOrigin(request), false);
  request.headers.delete("origin");
  assert.equal(isSameOrigin(request), false);
  request.headers.set("host", "rumah.example");
  request.headers.set("origin", "https://rumah.example");
  request.headers.set("x-forwarded-proto", "https");
  assert.equal(isSameOrigin(request), true);
  request.headers.set("origin", "http://rumah.example");
  assert.equal(isSameOrigin(request), false);
});
