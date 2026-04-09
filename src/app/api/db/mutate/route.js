import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { table, action, data, where } = body;

    if (!table || !action) {
      return NextResponse.json({ error: 'Missing table or action' }, { status: 400 });
    }

    const tableOps = localDb.tables[table];
    if (!tableOps) {
      return NextResponse.json({ error: `Table ${table} not found` }, { status: 404 });
    }

    // Build where conditions for update/delete
    const whereConditions = (where || []).map((w) => {
      if (w.op === 'eq') return [w.col, '=', w.val];
      if (w.op === 'neq') return [w.col, '!=', w.val];
      if (w.op === 'in') return [w.col, 'IN', w.val];
      if (w.op === 'lt') return [w.col, '<', w.val];
      if (w.op === 'lte') return [w.col, '<=', w.val];
      if (w.op === 'gt') return [w.col, '>', w.val];
      if (w.op === 'gte') return [w.col, '>=', w.val];
      if (w.op === 'not' && w.operator === 'is' && w.val === null) return [w.col, 'IS NOT', null];
      return [w.col, '=', w.val];
    });

    let result;
    if (action === 'insert') {
      result = await tableOps.insert(data);
    } else if (action === 'update') {
      result = await tableOps.update(data, whereConditions);
    } else if (action === 'upsert') {
      if (tableOps.upsert) {
        result = await tableOps.upsert(data);
      } else {
        // Fallback: try insert, if conflict then update
        try {
          result = await tableOps.insert(data);
        } catch {
          result = await tableOps.update(data, whereConditions);
        }
      }
    } else if (action === 'delete') {
      result = await tableOps.delete(whereConditions);
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Safe serialization for results that might contain BigInt or other non-JSON types
    const serializedResult = JSON.parse(
      JSON.stringify(result, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );

    return NextResponse.json(serializedResult);
  } catch (error) {
    console.error('DB mutate error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
