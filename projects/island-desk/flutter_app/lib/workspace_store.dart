import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class WorkspaceStore extends ChangeNotifier {
  final Map<String, dynamic> data;
  final File? file;
  String? saveError;
  Future<void> _pending = Future.value();
  WorkspaceStore(this.data, {this.file});
  static Map<String, dynamic> empty() => {
    'version': 1,
    'notes': <dynamic>[],
    'tasks': <dynamic>[],
    'calculations': <dynamic>[],
    'shortcuts': <dynamic>[],
    'timer': {
      'phase': 'work',
      'running': false,
      'endAt': null,
      'remainingMs': 1500000,
      'completed': 0,
    },
    'settings': <String, dynamic>{},
  };
  static Future<WorkspaceStore> load() async {
    final String support;
    if (Platform.isWindows) {
      final base = Platform.environment['APPDATA'];
      if (base == null) {
        throw const FileSystemException(
          'Windows app data directory is unavailable.',
        );
      }
      support = '$base\\Island Desk Flutter';
    } else {
      support =
          await const MethodChannel('islanddesk/platform')
              .invokeMethod<String>('dataDirectory') ??
          (throw const FileSystemException(
            'App data directory is unavailable.',
          ));
    }
    final file = File('$support${Platform.pathSeparator}workspace.json');
    if (await file.exists()) {
      return WorkspaceStore(_decode(await file.readAsString()), file: file);
    }
    // Import a copy of the existing Windows workspace. Never write to its original file.
    if (Platform.isWindows && Platform.environment['APPDATA'] != null) {
      final legacy = File(
        '${Platform.environment['APPDATA']}\\Island Desk\\island-desk.json',
      );
      if (await legacy.exists()) {
        return WorkspaceStore(_decode(await legacy.readAsString()), file: file);
      }
    }
    return WorkspaceStore(empty(), file: file);
  }

  static Map<String, dynamic> _decode(String text) {
    final data = jsonDecode(text);
    if (data is! Map ||
        data['version'] != 1 ||
        ![
          'notes',
          'tasks',
          'calculations',
          'shortcuts',
        ].every((k) => data[k] is List)) {
      throw const FormatException(
        'The workspace file is invalid. The original has not been changed.',
      );
    }
    return {...empty(), ...Map<String, dynamic>.from(data)};
  }

  List<Map<String, dynamic>> rows(String key) => (data[key] as List)
      .whereType<Map>()
      .map((v) => Map<String, dynamic>.from(v))
      .toList();
  String newId() =>
      '${DateTime.now().microsecondsSinceEpoch}-${identityHashCode(Object())}';
  void setRows(String key, List<Map<String, dynamic>> value) {
    data[key] = value;
    changed();
  }

  void changed() {
    notifyListeners();
    if (file == null) return;
    final text = jsonEncode(data);
    _pending = _pending.catchError((_) {}).then((_) async {
      try {
        await file!.parent.create(recursive: true);
        if (await file!.exists()) await file!.copy('${file!.path}.previous');
        final temp = File('${file!.path}.tmp');
        await temp.writeAsString(text, flush: true);
        await temp.rename(file!.path);
        saveError = null;
      } catch (_) {
        saveError = 'Changes could not be saved. Keep the app open and check available disk space.';
      }
      notifyListeners();
    });
  }

  Future<void> flush() => _pending;
}
