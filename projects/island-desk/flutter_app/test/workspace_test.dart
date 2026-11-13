import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:island_desk_flutter/main.dart';
import 'package:island_desk_flutter/calculator.dart';
import 'package:island_desk_flutter/translation_service.dart';
import 'package:island_desk_flutter/workspace_store.dart';

void main() {
  setUpAll(() async {
    final path = Platform.environment['ISLAND_FONT_FILE'];
    if (path != null) {
      final bytes = await File(path).readAsBytes();
      for (final family in ['Roboto', 'Segoe UI', 'Arial']) {
        await (FontLoader(
          family,
        )..addFont(Future.value(ByteData.sublistView(bytes)))).load();
      }
    }
    final iconPath = Platform.environment['ISLAND_ICON_FILE'];
    if (iconPath != null) {
      await (FontLoader('MaterialIcons')..addFont(
            Future.value(
              ByteData.sublistView(await File(iconPath).readAsBytes()),
            ),
          ))
          .load();
    }
  });
  test('calculator precedence, Unicode operators, percent, power and invalid input', () {
    expect(calculate('(12 + 8) × 3'), 60);
    expect(calculate('2^3^2'), 512);
    expect(calculate('200 * 10%'), 20);
    expect(calculate('-2^2'), -4);
    for (final expression in ['1/0', 'alert(1)', '2+', '(' * 100 + '1']) {
      expect(() => calculate(expression), throwsFormatException);
    }
  });
  test('translation splitting preserves Arabic, emoji and newlines within provider limits', () {
    for (final text in [
      'مرحبا بالعالم 🌍 '.repeat(100),
      'word '.repeat(400),
      'one\n\ntwo\n三',
    ]) {
      final parts = splitTranslation(text);
      expect(parts.join(), text);
      expect(parts.every((s) => utf8.encode(s).length <= 500), isTrue);
    }
    expect(decodeTranslation('&lt;hello&gt; &amp; &#1605;'), '<hello> & م');
  });
  test('workspace saves queued changes and retains a previous copy', () async {
    final directory = await Directory.systemTemp.createTemp(
      'island-flutter-test-',
    );
    try {
      final file = File('${directory.path}/workspace.json');
      final store = WorkspaceStore(WorkspaceStore.empty(), file: file);
      store.setRows('notes', [
        {'id': 'fictional', 'title': 'First', 'body': 'Test'},
      ]);
      store.setRows('notes', [
        {'id': 'fictional', 'title': 'Second', 'body': 'Test'},
      ]);
      await store.flush();
      expect(
        (jsonDecode(await file.readAsString())['notes'] as List).first['title'],
        'Second',
      );
      expect(
        (jsonDecode(await File('${file.path}.previous').readAsString())['notes']
                as List)
            .first['title'],
        'First',
      );
      store.dispose();
    } finally {
      await directory.delete(recursive: true);
    }
  });
  for (final width in [360.0, 1000.0]) {
    testWidgets(
      'Arabic-English translation and navigation preserve drafts at $width',
      (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final store = WorkspaceStore(WorkspaceStore.empty());
        final boundary = GlobalKey();
        await tester.pumpWidget(
          RepaintBoundary(
            key: boundary,
            child: IslandDesk(store: store, desktop: false),
          ),
        );
        await tester.pumpAndSettle();
        final source = find.byKey(const Key('translation-source'));
        await tester.enterText(source, 'Hello');
        await tester.pump();
        expect(
          tester
              .widget<TextField>(find.byKey(const Key('translation-output')))
              .textDirection,
          TextDirection.rtl,
        );
        await tester.tap(find.byTooltip('Swap languages'));
        await tester.pump();
        expect(
          tester.widget<TextField>(source).textDirection,
          TextDirection.rtl,
        );
        expect(tester.widget<TextField>(source).controller!.text, 'Hello');
        if (width < 760) {
          await tester.tap(find.byTooltip('Open navigation menu'));
          await tester.pumpAndSettle();
        }
        await tester.tap(find.text('Notes').first);
        await tester.pumpAndSettle();
        expect(find.text('New note'), findsOneWidget);
        if (width < 760) {
          await tester.tap(find.byTooltip('Open navigation menu'));
          await tester.pumpAndSettle();
        }
        await tester.tap(find.text('Translate').first);
        await tester.pumpAndSettle();
        expect(tester.widget<TextField>(source).controller!.text, 'Hello');
        expect(tester.takeException(), isNull);
        expect(
          tester.getRect(find.text('Translate').last).bottom,
          lessThan(800),
        );
        if (Platform.environment['ISLAND_CAPTURE'] == '1') {
          await tester.enterText(source, 'مرحبا، كيف حالك؟');
          await tester.pumpAndSettle();
          await tester.runAsync(() async {
            final image =
                await (boundary.currentContext!.findRenderObject()
                        as RenderRepaintBoundary)
                    .toImage();
            final bytes = await image.toByteData(
              format: ui.ImageByteFormat.png,
            );
            final file = File('../.qa/flutter-preview-${width.toInt()}.png');
            await file.writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          });
        }
        await tester.pumpWidget(const SizedBox.shrink());
        store.dispose();
      },
    );
  }
}

extension RepeatText on String {
  String repeat(int times) => List.filled(times, this).join();
}
