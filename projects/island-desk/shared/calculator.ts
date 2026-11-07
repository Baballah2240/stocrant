/** Recursive descent arithmetic; never uses eval or Function. Percent is a postfix /100 operator. */
export function calculate(expression: string): string {
  if (!expression.trim() || expression.length > 500) throw Error("Enter a calculation.");
  const source = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s/g, "");
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[()+\-*/%^]/g) || [];
  if (tokens.join("") !== source || tokens.length > 250) throw Error("Use numbers, parentheses and arithmetic operators.");
  let index = 0, depth = 0;
  const peek = () => tokens[index];
  function primary(): number {
    if (++depth > 60) throw Error("Too many nested parentheses.");
    let value: number;
    if (peek() === "(") { index++; value = sum(); if (tokens[index++] !== ")") throw Error("Close the parentheses."); }
    else { const token = tokens[index++]; if (!token || !/^(\d|\.)/.test(token)) throw Error("A number is missing."); value = Number(token); }
    while (peek() === "%") { value /= 100; index++; }
    depth--; return value;
  }
  function power(): number { let value = primary(); if (peek() === "^") { index++; value **= unary(); } return value; }
  function unary(): number { if (peek() === "+") { index++; return unary(); } if (peek() === "-") { index++; return -unary(); } return power(); }
  function product(): number {
    let value = unary();
    while (peek() === "*" || peek() === "/") { const op = tokens[index++], next = unary(); if (op === "/" && next === 0) throw Error("Cannot divide by zero."); value = op === "*" ? value * next : value / next; }
    return value;
  }
  function sum(): number { let value = product(); while (peek() === "+" || peek() === "-") { const op = tokens[index++], next = product(); value = op === "+" ? value + next : value - next; } return value; }
  const result = sum(); if (index !== tokens.length) throw Error("Check the operators and parentheses.");
  if (!Number.isFinite(result)) throw Error("The result is outside the supported range.");
  return String(Number(result.toPrecision(12)));
}
