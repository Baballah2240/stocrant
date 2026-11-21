import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'school_client_native.dart'
    if (dart.library.js_interop) 'school_client_web.dart';

enum Edition { parent, teacher }

typedef SchoolRow = Map<String, dynamic>;

class SchoolApiException implements Exception {
  const SchoolApiException(this.status);
  final int status;
}

class SchoolApi {
  SchoolApi(this.edition, {http.Client? client})
    : _client = client ?? createSchoolClient();

  final Edition edition;
  final http.Client _client;
  String? _token;

  static Uri get origin {
    const configured = String.fromEnvironment(
      'FASLII_SCHOOL_ORIGIN',
      defaultValue: 'https://schools.mohbaba.online',
    );
    final uri = kIsWeb ? Uri.base : Uri.parse(configured);
    if (uri.host.isEmpty ||
        (!kIsWeb && uri.scheme != 'https') ||
        uri.userInfo.isNotEmpty) {
      throw const FormatException('Invalid school server origin');
    }
    return Uri(
      scheme: uri.scheme,
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
    );
  }

  Future<http.Response> _send(String route, {SchoolRow? body}) async {
    final request = http.Request(
      body == null ? 'GET' : 'POST',
      origin.resolve('/api/mobile/$route'),
    )..followRedirects = false;
    request.headers['Accept'] = 'application/json';
    if (_token case final token?)
      request.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final response = await _client
        .send(request)
        .then(http.Response.fromStream)
        .timeout(Duration(seconds: body == null ? 12 : 90));
    if (response.statusCode != 200)
      throw SchoolApiException(response.statusCode);
    return response;
  }

  Future<SchoolRow> _request(String route, {SchoolRow? body}) async {
    final response = await _send(route, body: body);
    final result = jsonDecode(utf8.decode(response.bodyBytes));
    if (result is! SchoolRow)
      throw const FormatException('Invalid school response');
    return result;
  }

  Future<SchoolData> signIn({
    required String email,
    required String password,
    String? name,
    String? code,
  }) async {
    final result = await _request(
      code == null ? 'login' : 'community/register',
      body: {
        'email': email.trim(),
        'password': password,
        'audience': edition.name,
        if (code != null) 'code': code.trim(),
        if (name != null) 'name': name.trim(),
      },
    );
    final token = result['token'];
    if (token is! String || token.isEmpty)
      throw const FormatException('Missing school token');
    _token = token;
    try {
      return await refresh();
    } catch (_) {
      await signOut();
      rethrow;
    }
  }

  Future<SchoolRow> schoolName() => _request('school');

  /// Lessons, classwork and the school feed in one snapshot.
  Future<SchoolData> refresh() async {
    final results = await Future.wait([
      _request('timetable?view=cards'),
      _request('community'),
    ]);
    final cards = results[0], feed = results[1];
    if (cards['role'] != edition.name) throw const SchoolApiException(403);
    return SchoolData({
      ...cards,
      'posts': feed['posts'],
      'items': feed['items'],
      'showComments': feed['showComments'],
      'school': {
        ...?(cards['school'] as SchoolRow?),
        ...?(feed['school'] as SchoolRow?),
      },
    });
  }

  Future<Uint8List> photo(String id, [int index = 0]) async => (await _send(
    'community/photo/${Uri.encodeComponent(id)}?i=$index',
  )).bodyBytes;

  /// A teacher announcement for the school feed, with up to six photos.
  Future<void> postAnnouncement({
    required String title,
    required String text,
    required List<String> photos,
  }) async => _request(
    'community/post',
    body: {'title': title, 'text': text, 'photos': photos},
  );

  Future<void> removePost(String id) async =>
      _request('community/remove', body: {'postId': id});

  /// A parent attaches a file to a classwork item for one child.
  Future<void> submitWork({
    required String workId,
    required String studentId,
    required String name,
    required String data,
  }) async => _request(
    'work/submit',
    body: {
      'workId': workId,
      'studentId': studentId,
      'file': {'name': name, 'data': data},
    },
  );

  Future<Uint8List> submission(String id) async =>
      (await _send('submission/${Uri.encodeComponent(id)}')).bodyBytes;

  Future<void> linkChild(String code) async =>
      _request('parent/link', body: {'code': code.trim()});

  Future<void> removeWork(String id) async =>
      _request('work/remove', body: {'id': id});

  Future<void> like(String id, bool liked) async =>
      _request('community/like', body: {'postId': id, 'liked': liked});

  Future<void> comment(String id, String text) async =>
      _request('community/comment', body: {'postId': id, 'text': text});

  Future<List<SchoolRow>> notifications() async =>
      schoolRows((await _request('notifications'))['items']);

  Future<void> postWork(SchoolRow work) async =>
      _request('work', body: {...work, 'community': true});

  Future<void> signOut() async {
    final token = _token;
    if (token == null) return;
    final logout = _request('logout', body: {});
    _token = null;
    try {
      await logout;
    } catch (_) {
      // The client is signed out even if the server cannot be reached.
    }
  }

  void close() => _client.close();
}

class SchoolData {
  SchoolData(this._data) : receivedAt = DateTime.now();

  final SchoolRow _data;
  final DateTime receivedAt;

  SchoolRow get school =>
      _data['school'] is SchoolRow ? _data['school'] as SchoolRow : {};
  List<SchoolRow> rows(String key) => schoolRows(_data[key]);
  bool get showComments => _data['showComments'] == true;
  SchoolRow? get next => _data['next'] as SchoolRow?;
  String get today => textValue(_data, 'today');
  List<Object?> get assignedClasses => _data['assignedClassIds'] is List
      ? _data['assignedClassIds'] as List
      : const [];
}

List<SchoolRow> schoolRows(Object? value) => value is List
    ? value.whereType<SchoolRow>().toList(growable: false)
    : const [];

String textValue(SchoolRow row, String key) =>
    row[key] is String ? row[key] as String : '';

String localizedValue(SchoolRow row, String key, bool arabic) {
  final preferred = textValue(row, '$key${arabic ? 'Ar' : 'En'}');
  return preferred.isNotEmpty
      ? preferred
      : textValue(row, '$key${arabic ? 'En' : 'Ar'}');
}
