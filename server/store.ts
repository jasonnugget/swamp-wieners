import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export class Store {
  db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, "planit.sqlite"));
    this.db.exec(
      `PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));`,
    );
  }
  all<T>(kind: string): T[] {
    return (
      this.db
        .prepare("SELECT value FROM records WHERE kind = ? ORDER BY rowid")
        .all(kind) as { value: string }[]
    ).map((r) => JSON.parse(r.value));
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT value FROM records WHERE kind=? AND id=?")
      .get(kind, id) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }
  put(kind: string, id: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO records (kind,id,value) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
      )
      .run(kind, id, JSON.stringify(value));
  }
  insert(kind: string, id: string, value: unknown) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO records (kind,id,value) VALUES (?,?,?)")
        .run(kind, id, JSON.stringify(value)).changes > 0
    );
  }
  clear(kind: string) {
    this.db.prepare("DELETE FROM records WHERE kind=?").run(kind);
  }
  close() {
    this.db.close();
  }
}
