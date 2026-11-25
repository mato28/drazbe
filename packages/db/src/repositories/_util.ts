/** First row of an INSERT/UPDATE ... RETURNING that must produce exactly one row. */
export function one<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('Expected the query to return a row');
  return row;
}
