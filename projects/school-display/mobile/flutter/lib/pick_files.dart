import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

/// A file ready to send: its name, size and a base64 data URL.
typedef PickedFile = ({String name, int size, String data, Uint8List bytes});

const maxUploadBytes = 5 * 1024 * 1024;
const photoTypes = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'};
const documentTypes = {
  ...photoTypes,
  'pdf': 'application/pdf',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'txt': 'text/plain',
};

class PickProblem implements Exception {
  const PickProblem(this.tooLarge, this.wrongType);
  final bool tooLarge;
  final bool wrongType;
}

String extensionOf(String name) {
  final dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
}

Future<PickedFile> _prepare(PlatformFile file, Map<String, String> types) async {
  final ext = extensionOf(file.name);
  final mime = types[ext];
  if (mime == null) throw const PickProblem(false, true);
  final bytes = await file.readAsBytes();
  if (bytes.isEmpty || bytes.length > maxUploadBytes) {
    throw const PickProblem(true, false);
  }
  return (
    name: file.name,
    size: bytes.length,
    bytes: bytes,
    data: 'data:$mime;base64,${base64Encode(bytes)}',
  );
}

/// Photos for a post. Phone cameras are compressed so each stays under 5 MB.
Future<List<PickedFile>> pickPhotos(int limit) async {
  final files = await FilePicker.pickFiles(
    type: FileType.image,
    compressionQuality: 70,
  );
  return Future.wait(files.take(limit).map((file) => _prepare(file, photoTypes)));
}

/// One document or photo to attach to classwork.
Future<PickedFile?> pickDocument() async {
  final file = await FilePicker.pickFile(
    type: FileType.custom,
    allowedExtensions: documentTypes.keys.toList(),
  );
  return file == null ? null : _prepare(file, documentTypes);
}

/// Saves a downloaded file where the person chooses (a download on the web).
Future<bool> saveDownloadedFile(String name, Uint8List bytes) async {
  final ext = extensionOf(name);
  final saved = await FilePicker.saveFile(
    fileName: name,
    bytes: bytes,
    mimeType: documentTypes[ext] ?? 'application/octet-stream',
  );
  return saved != null;
}
