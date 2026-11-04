import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// React Testing Library otomatik temizligi icin (globals kapali).
afterEach(() => {
  cleanup();
});
