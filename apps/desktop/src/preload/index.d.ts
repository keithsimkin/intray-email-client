import type { IntrayApi } from "./index";

declare global {
  interface Window {
    intray: IntrayApi;
  }
}

export {};
