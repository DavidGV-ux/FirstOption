declare module 'sql.js' {
  interface SqlJsStatic {
    Database: any;
  }
  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
  export default initSqlJs;
}