/** Reads a text field from FormData (file inputs and missing fields yield ''). */
export function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
