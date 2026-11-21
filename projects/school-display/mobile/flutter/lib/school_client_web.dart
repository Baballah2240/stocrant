import 'dart:js_interop';

import 'package:http/http.dart' as http;
import 'package:web/web.dart' as web;

http.Client createSchoolClient() => _CookieFreeClient();

class _CookieFreeClient extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().toBytes();
    final headers = web.Headers();
    request.headers.forEach((name, value) => headers.append(name, value));
    final response = await web.window
        .fetch(
          request.url.toString().toJS,
          web.RequestInit(
            method: request.method,
            headers: headers,
            body: body.isEmpty ? null : body.toJS,
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
          ),
        )
        .toDart;
    final bytes = (await response.arrayBuffer().toDart).toDart.asUint8List();
    return http.StreamedResponse(
      Stream.value(bytes),
      response.status,
      request: request,
    );
  }
}
