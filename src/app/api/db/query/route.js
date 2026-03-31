import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

export const dynamic = 'force-dynamic';

// Convert Supabase-style select to SQL-compatible select
function normalizeSelect(selectStr) {
  if (!selectStr || selectStr === '*') return '*';
  // Remove nested relations like tasks(count), project(*)
  return (
    selectStr
      .split(',')
      .map((f) => f.trim())
      .filter((f) => !f.includes('('))
      .join(', ') || '*'
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table');
    const selectRaw = searchParams.get('select') || '*';
    const whereStr = searchParams.get('where');
    const orderByStr = searchParams.get('orderBy');
    const limitStr = searchParams.get('limit');

    if (!table) {
      return NextResponse.json({ error: 'Missing table parameter' }, { status: 400 });
    }

    const select = normalizeSelect(selectRaw);
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
      }
    }

    // Build order by
    const orderByClauses = orderBy.map((o) => `${o.col} ${o.ascending ? 'ASC' : 'DESC'}`);

    // Build query
    let sql = `SELECT ${select} FROM ${table}`;
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

    return NextResponse.json(rows);
  } catch (error) {
    console.error('DB query error:', error.message, error);
    return NextResponse.json({ error: error.message || 'Query failed' }, { status: 500 });
  }
}
