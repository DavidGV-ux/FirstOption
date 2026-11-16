// Fallback para tsc/typecheck: Metro resuelve .web.ts / .native.ts según la
// plataforma en el build. Este archivo nunca se usa en runtime.
export { openSqlJsDatabase } from './sqljs-driver.web';