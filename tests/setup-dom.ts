/**
 * Setup for the "dom" project (jsdom). Registers @testing-library/jest-dom
 * matchers and unmounts rendered trees after each test so component tests stay
 * isolated. Only loaded for *.test.tsx — never in the node "server" project.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
