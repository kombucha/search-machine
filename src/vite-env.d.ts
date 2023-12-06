/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ALGOLIA_APPLICATION_ID: string
  readonly VITE_ALGOLIA_SEARCH_API_KEY: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
