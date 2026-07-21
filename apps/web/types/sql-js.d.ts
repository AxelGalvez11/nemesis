// sql.js ships without TypeScript declarations. Only the surface Anki import
// uses is declared here — the node build (tests) and the browser build
// (public/sql-wasm.js) share this shape.
declare module "sql.js" {
  export interface NodeSqlDatabase {
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    export(): Uint8Array;
    close(): void;
  }
  export interface NodeSqlEngine {
    Database: new (data?: Uint8Array) => NodeSqlDatabase;
  }
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<NodeSqlEngine>;
  export default initSqlJs;
}
