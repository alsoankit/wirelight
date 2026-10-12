// The Web Worker entry: the session behind Comlink (Apache-2.0). The main thread creates it with
// `new Worker(new URL("@wirelight/engine/worker", import.meta.url), { type: "module" })` and wraps it.
import { expose } from "comlink";
import { Session } from "./session";

expose(new Session());
