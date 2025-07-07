import Sqlite3 from "better-sqlite3";
import mysql, { Connection } from "mysql2/promise";
import { join } from "node:path";
import { Pool } from "pg";

export class Database {
	enabled: boolean = true;
	dbType: string;
	dbConfig: any;
	db?: Sqlite3.Database | Connection | Pool;

	constructor(env: Record<string, string>) {
		this.enabled =
			env.DATABASE_TYPE === "sqlite" ||
			env.DATABASE_TYPE === "mysql" ||
			env.DATABASE_TYPE === "postgres" ||
			env.POSTGRES_URL?.length > 0;
		this.dbType =
			env.DATABASE_TYPE || (env.POSTGRES_URL ? "postgres" : "sqlite");

		if (this.dbType === "sqlite")
			this.dbConfig = join(__dirname, "..", "lyrics.db");
		else this.dbConfig = env.DATABASE_URL;
	}

	async initialize() {
		if (!this.enabled) return;

		if (this.dbType === "sqlite") {
			this.db = new Sqlite3(this.dbConfig);
		} else if (this.dbType === "mysql") {
			this.db = await mysql.createConnection(this.dbConfig);
		} else if (this.dbType === "postgres") {
			this.db = new Pool({ connectionString: this.dbConfig });
		}

		await this.query(
			`
            CREATE TABLE IF NOT EXISTS lyrics (
                id TEXT PRIMARY KEY,
                syncType INTEGER,
                lines TEXT,
                bgColor INTEGER,
                textColor INTEGER,
                highlightColor INTEGER
            )
        `,
			true
		);

		await this.query(
			`
            CREATE TABLE IF NOT EXISTS variables (
                name TEXT PRIMARY KEY,
                value TEXT
            )
        `,
			true
		);

		try {
			await this.query(
				`
				INSERT INTO variables (name, value)
				VALUES ('sp_access_token', '')
			`,
				true
			);
		} catch {}
	}

	async query<T = any>(sql: string, exec = false): Promise<T | undefined> {
		if (this.dbType === "sqlite") {
			try {
				if (exec) {
					(this.db as Sqlite3.Database).exec(sql);
					return undefined;
				}

				const stmt = (this.db as Sqlite3.Database).prepare(sql);
				const result = stmt.get() as T;
				return result;
			} catch {}
		} else if (this.dbType === "mysql") {
			const [rows] = await (this.db as Connection).execute(sql);
			return rows[0] as T;
		} else if (this.dbType === "postgres") {
			const result = await (this.db as Pool).query(sql);
			return result.rows[0] as T;
		}
	}

	async close() {
		if (this.dbType === "sqlite") {
			(this.db as Sqlite3.Database).close();
		} else if (this.dbType === "mysql") {
			await (this.db as Connection).end();
		} else if (this.dbType === "postgres") {
			await (this.db as Pool).end();
		}
	}
}
