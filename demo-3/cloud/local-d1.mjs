// Local-only D1-shaped adapter using Node's bundled SQLite. No network calls.
import {DatabaseSync} from 'node:sqlite';
export class LocalD1 {
  constructor(filename=':memory:'){this.db=new DatabaseSync(filename);this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}
  exec(sql){this.db.exec(sql);}
  prepare(sql){return new LocalStatement(this,sql,[]);}
  async batch(statements){this.db.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute('all'));this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  close(){this.db.close();}
}
class LocalStatement {
  constructor(owner,sql,values){this.owner=owner;this.sql=sql;this.values=values;}
  bind(...values){return new LocalStatement(this.owner,this.sql,values);}
  execute(kind){const stmt=this.owner.db.prepare(this.sql);if(kind==='first')return stmt.get(...this.values)||null;let results=[];if(stmt.columns().length)results=stmt.all(...this.values);else stmt.run(...this.values);const changed=this.owner.db.prepare('SELECT changes() AS changes').get().changes;return {success:true,results,meta:{changes:Number(changed)}};}
  async first(column){const value=this.execute('first');return column?value?.[column]??null:value;}
  async all(){return this.execute('all');}
  async run(){return this.execute('run');}
}
