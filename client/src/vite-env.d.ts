/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RESOURCE_VERSION: string;
  readonly VITE_MULTIPLAYER_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
