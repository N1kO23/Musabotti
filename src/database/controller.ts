import sqlite3, { Statement } from "sqlite3";
import { Database, open } from "sqlite";
import * as fs from "fs";

// you would have to import / invoke this in another file
export async function openDb() {
  return open({
    filename: "./database.db",
    driver: sqlite3.Database,
  });
}

export function migrate(
  db: Database<sqlite3.Database, Statement>,
  path: string
) {
  fs.readFile(path, "utf8", (err, migrationScript) => {
    if (err) {
      console.error("Error reading migration script:", err);
      return;
    }

    try {
      db.exec(migrationScript);
    } catch (error) {
      console.error("Error executing migration:", error);
    }
  });
}
