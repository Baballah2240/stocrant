import 'dart:async';
import 'dart:convert';
import 'dart:io';

class TranslationFailure implements Exception {
  final String message;
  const TranslationFailure(this.message);
  @override
  String toString() => message;
}

List<String> splitTranslation(String text) {
  final result = <String>[];
  for (final line
      in text
          .splitMapJoin(RegExp(r'\n+'), onMatch: (m) => '\u0000${m[0]}\u0000')
          .split('\u0000')) {
    if (line.trim().isEmpty) {
      result.add(line);
      continue;
    }
    var chunk = '';
    var size = 0;
    for (final rune in line.runes) {
      final char = String.fromCharCode(rune);
      final bytes = utf8.encode(char).length;
      if (size + bytes > 480) {
        final boundary = chunk.lastIndexOf(' ');
        if (boundary > chunk.length ~/ 2) {
          result.add(chunk.substring(0, boundary));
          result.add(' ');
          chunk = chunk.substring(boundary + 1);
          size = utf8.encode(chunk).length;
        } else {
          result.add(chunk);
          chunk = '';
          size = 0;
        }
      }
      chunk += char;
      size += bytes;
    }
    if (chunk.isNotEmpty) result.add(chunk);
  }
  return result;
}

String decodeTranslation(String text) => text.replaceAllMapped(
  RegExp(r'&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);'),
  (m) {
    const entities = {
      'amp': '&',
      'lt': '<',
      'gt': '>',
      'quot': '"',
      'apos': "'",
      'nbsp': ' ',
    };
    final entity = m[1]!;
    if (entities.containsKey(entity)) return entities[entity]!;
    final code = entity.startsWith('#x')
        ? int.tryParse(entity.substring(2), radix: 16)
        : int.tryParse(entity.substring(1));
    return code != null &&
            code > 0 &&
            code <= 0x10ffff &&
            !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCharCode(code)
        : m[0]!;
  },
);

class TranslationService {
  HttpClient? _client;
  int _sequence = 0;
  void cancel() {
    _sequence++;
    _client?.close(force: true);
    _client = null;
  }

  Future<String> translate(String text, String from, String to) async {
    if (text.trim().isEmpty ||
        text.length > 3000 ||
        !['en', 'ar'].contains(from) ||
        !['en', 'ar'].contains(to) ||
        from == to) {
      throw const TranslationFailure(
        'Choose Arabic and English and enter up to 3,000 characters.',
      );
    }
    cancel();
    final sequence = _sequence;
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 15);
    _client = client;
    final output = <String>[];
    try {
      for (final segment in splitTranslation(text)) {
        if (sequence != _sequence) throw const TranslationFailure('Canceled.');
        if (segment.trim().isEmpty) {
          output.add(segment);
          continue;
        }
        final uri = Uri.https('api.mymemory.translated.net', '/get', {
          'q': segment,
          'langpair': '$from|$to',
          'mt': '1',
        });
        final request = await client
            .getUrl(uri)
            .timeout(const Duration(seconds: 15));
        request.followRedirects = false;
        final response = await request.close().timeout(
          const Duration(seconds: 15),
        );
        if (response.statusCode == 429) {
          throw const TranslationFailure(
            'The free translation limit has been reached. Try again later.',
          );
        }
        if (response.statusCode != 200) {
          throw const TranslationFailure(
            'Translation is unavailable. Please try again.',
          );
        }
        final body = await response
            .transform(utf8.decoder)
            .join()
            .timeout(const Duration(seconds: 15));
        if (body.length > 200000) {
          throw const TranslationFailure(
            'The translation response was too large.',
          );
        }
        final data = jsonDecode(body);
        if (data is! Map) throw const FormatException();
        if (data['quotaFinished'] == true ||
            ['403', '429'].contains('${data['responseStatus']}')) {
          throw const TranslationFailure(
            'The free translation limit has been reached. Try again later.',
          );
        }
        final translated = data['responseData'] is Map
            ? data['responseData']['translatedText']
            : null;
        if ('${data['responseStatus']}' != '200' ||
            translated is! String ||
            translated.trim().isEmpty) {
          throw const TranslationFailure(
            'Translation is unavailable. Please try again.',
          );
        }
        output.add(decodeTranslation(translated));
      }
      if (sequence != _sequence) throw const TranslationFailure('Canceled.');
      return output.join();
    } on TranslationFailure {
      rethrow;
    } catch (_) {
      throw TranslationFailure(
        sequence != _sequence ? 'Canceled.' : 'Could not connect. Check your internet connection and try again.',
      );
    } finally {
      client.close(force: true);
      if (sequence == _sequence) _client = null;
    }
  }
}
