import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppPreferences {
  late final _store = SharedPreferencesAsync();

  Future<String?> language() => _store.getString('language');
  Future<void> setLanguage(String code) async =>
      _store.setString('language', code);
  Future<bool> lockEnabled() async => await _store.getBool('appLock') ?? false;
  Future<void> setLock(bool enabled) => _store.setBool('appLock', enabled);
}

class DeviceBiometrics {
  final _auth = LocalAuthentication();

  bool get supportedPlatform =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  Future<bool> enrolled() async =>
      supportedPlatform && (await _auth.getAvailableBiometrics()).isNotEmpty;

  Future<bool> confirm(String reason) => _auth.authenticate(
    localizedReason: reason,
    biometricOnly: true,
    persistAcrossBackgrounding: true,
  );
}

enum UpdateStatus { current, available, unconfigured }

Future<UpdateStatus> checkForUpdate() async {
  const build = int.fromEnvironment('FASLII_BUILD', defaultValue: 2);
  const feed = String.fromEnvironment('FASLII_UPDATE_FEED');
  if (!kIsWeb && feed.isEmpty) return UpdateStatus.unconfigured;
  final uri = kIsWeb
      ? Uri.base
            .resolve('release.json')
            .replace(
              queryParameters: {
                'v': DateTime.now().millisecondsSinceEpoch.toString(),
              },
            )
      : Uri.parse(feed);
  if (!kIsWeb && (uri.scheme != 'https' || uri.host.isEmpty)) {
    return UpdateStatus.unconfigured;
  }
  final response = await http.get(uri).timeout(const Duration(seconds: 8));
  if (response.statusCode != 200)
    throw const FormatException('Update feed unavailable');
  final release = jsonDecode(response.body);
  if (release is! Map<String, dynamic> ||
      release['build'] is! int ||
      (release['build'] as int) < 1) {
    throw const FormatException('Invalid release feed');
  }
  return (release['build'] as int) > build
      ? UpdateStatus.available
      : UpdateStatus.current;
}
