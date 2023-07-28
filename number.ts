export const getDigits = (s: string) => s.match(/\d+/g)?.join("") || "";
