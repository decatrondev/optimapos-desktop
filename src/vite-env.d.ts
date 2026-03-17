/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SOCKET_URL: string;
    readonly VITE_STORE_NAME: string;
    readonly VITE_CURRENCY_SYMBOL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
