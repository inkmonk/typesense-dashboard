// Tables keep their Actions column (edit / delete) only for users who can write.
export function withoutActions<T extends { name: string }>(
  columns: readonly T[] | undefined,
  canWrite: boolean,
): T[] | undefined {
  if (canWrite || !columns) return columns as T[] | undefined;
  return columns.filter((c) => c.name !== 'actions' && c.name !== 'actions_op');
}
