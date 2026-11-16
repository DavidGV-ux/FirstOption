// En native no se usa sql.js: la base se abre con expo-sqlite + SQLCipher.
// Este stub existe solo para que Metro no incluya sql.js en el bundle nativo.
export async function openSqlJsDatabase(): Promise<never> {
  throw new Error('sql.js solo está disponible en web.');
}
