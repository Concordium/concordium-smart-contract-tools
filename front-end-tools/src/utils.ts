import { EXAMPLE_ARRAYS, EXAMPLE_JSON_OBJECT } from './constants';

export function arraysEqual(a: Uint8Array, b: Uint8Array) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function getObjectExample(template: string | undefined) {
    return template !== undefined
        ? JSON.stringify(JSON.parse(template), undefined, 2)
        : JSON.stringify(EXAMPLE_JSON_OBJECT, undefined, 2);
}

export function getArrayExample(template: string | undefined) {
    return template !== undefined ? JSON.stringify(JSON.parse(template), undefined, 2) : EXAMPLE_ARRAYS;
}
