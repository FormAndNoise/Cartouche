/**
 * Re-exports the backend command API surface in one place so components import
 * from `@/lib/api` rather than reaching into `@tauri-apps/api` directly.
 *
 * During the scaffold phase, only the version-ping IPC is defined. As feature
 * work lands (US-B02 onward), commands are typed and exported from here.
 */

export { invoke } from "@tauri-apps/api/core";
