import { test, expect } from "bun:test";
import { monitoredPage } from "./access-monitoring";

test("daily page groups include the customer order page", () => {
  expect(monitoredPage("/pedidos")).toBe("/pedidos");
});
test("ticket identifiers are excluded from stored page groups", () => {
  expect(monitoredPage("/suporte/private-ticket-id")).toBe("/suporte");
});
test("unknown paths are not recorded", () => {
  expect(monitoredPage("/auth")).toBeNull();
  expect(monitoredPage("/pedidos-malicious")).toBeNull();
});