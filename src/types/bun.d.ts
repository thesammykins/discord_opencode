declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean });
    prepare(sql: string): Statement;
    run(sql: string): void;
    close(): void;
  }

  export interface Statement {
    get(...params: any[]): any;
    run(...params: any[]): void;
  }
}
