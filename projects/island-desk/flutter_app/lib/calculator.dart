import 'dart:math' as math;

/// Bounded expression parser; never executes user input as code.
double calculate(String expression) {
  if (expression.length > 500) {
    throw const FormatException('Expression is too long.');
  }
  final p = _Parser(
    expression.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-'),
  );
  final result = p.sum();
  p.space();
  if (p.index != p.text.length || !result.isFinite) {
    throw const FormatException('Check your calculation.');
  }
  return result;
}

class _Parser {
  final String text;
  int index = 0, depth = 0;
  _Parser(this.text);
  void space() {
    while (index < text.length && text[index].trim().isEmpty) {
      index++;
    }
  }

  bool eat(String char) {
    space();
    if (index < text.length && text[index] == char) {
      index++;
      return true;
    }
    return false;
  }

  double sum() {
    var value = product();
    while (true) {
      if (eat('+')) {
        value += product();
      } else if (eat('-')) {
        value -= product();
      } else {
        return value;
      }
    }
  }

  double product() {
    var value = unary();
    while (true) {
      if (eat('*')) {
        value *= unary();
      } else if (eat('/')) {
        value /= unary();
      } else {
        return value;
      }
    }
  }

  double unary() {
    if (++depth > 64) throw const FormatException('Calculation is too nested.');
    try {
      if (eat('+')) return unary();
      if (eat('-')) return -unary();
      return power();
    } finally {
      depth--;
    }
  }

  double power() {
    var value = atom();
    while (eat('%')) {
      value /= 100;
    }
    if (eat('^')) value = math.pow(value, unary()).toDouble();
    return value;
  }

  double atom() {
    if (eat('(')) {
      final value = sum();
      if (!eat(')')) throw const FormatException('Close the parentheses.');
      return value;
    }
    space();
    final match = RegExp(r'^(?:\d+\.?\d*|\.\d+)')
        .firstMatch(text.substring(index));
    if (match == null) throw const FormatException('Enter a number.');
    index += match[0]!.length;
    return double.parse(match[0]!);
  }
}
