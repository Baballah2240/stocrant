import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

http.Client createSchoolClient() {
  const certificate = String.fromEnvironment('FASLII_USB_CERT');
  const origin = String.fromEnvironment('FASLII_SCHOOL_ORIGIN');
  if (!kDebugMode || certificate.isEmpty || origin != 'https://127.0.0.1:4321') {
    return http.Client();
  }
  // A dedicated certificate authenticates the USB development bridge.
  final context = SecurityContext(withTrustedRoots: false)
    ..setTrustedCertificatesBytes(base64Decode(certificate));
  return IOClient(HttpClient(context: context));
}
