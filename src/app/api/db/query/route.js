import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

export const dynamic = 'force-dynamic';

// Parse select string to extract relations like tasks(count)
function parseSelect(selectStr) {
  if (!selectStr || selectStr === '*') return { fields: '*', relations: [] };

  const parts = selectStr.split(',').map((f) => f.trim());
  const fields = [];
  const relations = [];

  for (const part of parts) {
    const relationMatch = part.match(/^(\w+)\((\w+)\)$/);
    if (relationMatch) {
      relations.push({ name: relationMatch[1], aggregate: relationMatch[2] });
    } else if (!part.includes('(')) {
      fields.push(part);
    }
  }

  return {
    fields: fields.length > 0 ? fields.join(', ') : '*',
    relations,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table');
    const selectRaw = searchParams.get('select') || '*';
    const whereStr = searchParams.get('where');
    const orderByStr = searchParams.get('orderBy');
    const limitStr = searchParams.get('limit');

    // Validate table name against allowlist BEFORE building any SQL
    const ALLOWED_TABLES = Object.keys(localDb.tables);
    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: `Invalid table: ${table}. Allowed: ${ALLOWED_TABLES.join(', ')}` },
        { status: 400 }
      );
    }

    const { fields, relations } = parseSelect(selectRaw);
    const where = whereStr ? JSON.parse(whereStr) : [];
    const orderBy = orderByStr ? JSON.parse(orderByStr) : [];
    const limit = limitStr ? parseInt(limitStr) : null;

    const tableOps = localDb.tables[table];
    if (!tableOps) {
      return NextResponse.json({ error: `Table ${table} not found` }, { status: 404 });
    }

    // Build where conditions
    const whereConditions = [];
    const whereParams = [];
    for (const w of where) {
      if (w.op === 'eq') {
        whereConditions.push(`${w.col} = ?`);
        whereParams.push(w.val);
      } else if (w.op === 'neq') {
        whereConditions.push(`${w.col} != ?`);
        whereParams.push(w.val);
      } else if (w.op === 'in') {
        if (w.val && w.val.length > 0) {
          const placeholders = w.val.map(() => '?').join(', ');
          whereConditions.push(`${w.col} IN (${placeholders})`);
          whereParams.push(...w.val);
        } else {
          whereConditions.push('1 = 0');
        }
      } else if (w.op === 'lt') {
        whereConditions.push(`${w.col} < ?`);
        whereParams.push(w.val);
      } else if (w.op === 'lte') {
        whereConditions.push(`${w.col} <= ?`);
        whereParams.push(w.val);
      } else if (w.op === 'gt') {
        whereConditions.push(`${w.col} > ?`);
        whereParams.push(w.val);
      } else if (w.op === 'gte') {
        whereConditions.push(`${w.col} >= ?`);
        whereParams.push(w.val);
      } else if (w.op === 'not' && w.operator === 'is' && w.val === null) {
        whereConditions.push(`${w.col} IS NOT NULL`);
      }
    }

    // Build order by
    const orderByClauses = orderBy.map((o) => `${o.col} ${o.ascending ? 'ASC' : 'DESC'}`);

    // Build query
    let sql = `SELECT ${fields} FROM ${table}`;
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    if (orderByClauses.length > 0) {
      sql += ` ORDER BY ${orderByClauses.join(', ')}`;
    }
    if (limit) {
      sql += ` LIMIT ?`;
      whereParams.push(limit);
    }

    const db = localDb.getDb();
    const stmt = db.prepare(sql);
    const rows = stmt.all(...whereParams);

    // Process relations (e.g., tasks(count))
    if (relations.length > 0 && rows.length > 0) {
      for (const row of rows) {
        for (const rel of relations) {
          if (rel.name === 'tasks' && rel.aggregate === 'count') {
            const countStmt = db.prepare(
              `SELECT COUNT(*) as count FROM tasks WHERE project_id = ?`
            );
            const result = countStmt.get(row.id);
            row.tasks = [{ count: result.count }];
          }
        }
      }
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error('DB query error:', error.message, error);
    return NextResponse.json({ error: error.message || 'Query failed' }, { status: 500 });
  }
}
