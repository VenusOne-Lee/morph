/**
 * Tiny typed t(key, vars) helper (MO-007). Each package keeps its copy in
 * a `locales/en.json` file and creates its own translator from it.
 */
export type Messages = Record<string, string>;
export type Vars = Record<string, string | number>;

export function createTranslator<M extends Messages>(messages: M) {
  return function t(key: keyof M & string, vars: Vars = {}): string {
    const template = messages[key];
    if (template === undefined) return key;
    return interpolate(template, vars);
  };
}

/** `{count} deal|deals` plural shorthand and `{name}` placeholders. */
export function interpolate(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}(?:\s?\[([^\]|]*)\|([^\]]*)\])?/g, (_m, name: string, one?: string, many?: string) => {
    const v = vars[name];
    const text = v === undefined ? `{${name}}` : String(v);
    if (one === undefined) return text;
    return `${text} ${Number(v) === 1 ? one : many}`;
  });
}
