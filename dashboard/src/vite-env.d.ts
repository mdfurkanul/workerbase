/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL the dashboard fetches the collections index from. */
  readonly VITE_COLLECTIONS_URL?: string;
  /** Optional app-version override (defaults to v0.0.1-beta). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
