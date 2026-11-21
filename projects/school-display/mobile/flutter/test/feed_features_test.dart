import 'dart:convert';

import 'package:faslii_layout/classwork_page.dart';
import 'package:faslii_layout/notifications_page.dart';
import 'package:faslii_layout/photo_gallery.dart';
import 'package:faslii_layout/school_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

// A valid 1×1 PNG so Image.memory decodes in tests.
final pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
);

Widget app(Widget child, {bool arabic = false}) => MaterialApp(
  locale: Locale(arabic ? 'ar' : 'en'),
  supportedLocales: const [Locale('en'), Locale('ar')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Scaffold(body: child),
);

void main() {
  testWidgets('a post with several photos swipes, opens full screen and zooms', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final requested = <int>[];
    await tester.pumpWidget(app(Center(
      child: SizedBox(
        width: 360,
        child: PostGallery(count: 3, load: (index) async {
          requested.add(index);
          return pixel;
        }),
      ),
    )));
    await tester.pumpAndSettle();
    expect(find.text('1/3'), findsOneWidget);

    await tester.fling(find.byType(PageView), const Offset(-300, 0), 1200);
    await tester.pumpAndSettle();
    expect(find.text('2/3'), findsOneWidget);

    await tester.tap(find.byType(PageView));
    await tester.pumpAndSettle();
    expect(find.byType(PhotoViewer), findsOneWidget);
    expect(find.text('2 / 3'), findsOneWidget);
    expect(find.text('Swipe to browse · Double-tap or pinch to zoom'), findsOneWidget);

    final photo = find.descendant(of: find.byType(PhotoViewer), matching: find.byType(InteractiveViewer)).first;
    await tester.tap(photo);
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(photo);
    await tester.pumpAndSettle();
    expect(find.text('Swipe to browse · Double-tap or pinch to zoom'), findsNothing, reason: 'Zoomed in');

    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.byType(PhotoViewer), findsNothing);
    expect(requested, [0, 1], reason: 'Photos load when shown, once each, and the viewer reuses them.');
    expect(tester.takeException(), isNull);
  });

  testWidgets('notifications are grouped, marked unread and open in full', (tester) async {
    final now = DateTime.now();
    final seen = <String>{};
    final items = collectNotices(SchoolData({
      'items': [
        {'id': '1', 'title': 'Early dismissal', 'text': 'School ends at 12:30.', 'at': now.toIso8601String()},
        {'id': '2', 'title': 'Fractions', 'text': 'Homework posted', 'type': 'classwork', 'at': now.subtract(const Duration(days: 1)).toIso8601String()},
      ],
      'messages': [
        {'id': 'm', 'subject': 'Cover tomorrow', 'text': 'Grade 7B at 9:00', 'at': now.subtract(const Duration(days: 9)).toIso8601String()},
      ],
    }), false);
    await tester.pumpWidget(app(NotificationsPage(items: items, seen: const {}, onSeen: seen.addAll)));
    await tester.pumpAndSettle();
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Yesterday'), findsOneWidget);
    expect(find.text('Earlier'), findsOneWidget);
    expect(find.text('Classwork'), findsOneWidget);
    expect(tester.widgetList<AnimatedOpacity>(find.byType(AnimatedOpacity)).where((dot) => dot.opacity == 1), hasLength(3), reason: 'Three unread dots');
    expect(seen, {'n:1', 'n:2', 'm:m'});

    await tester.tap(find.text('Early dismissal'));
    await tester.pumpAndSettle();
    expect(find.text('School ends at 12:30.'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('teachers see files from parents; parents without a child add one', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    SchoolRow? opened;
    final data = SchoolData({
      'today': '2026-11-21',
      'assignedClassIds': ['a'],
      'classes': [{'id': 'a', 'nameEn': 'Grade 6A'}],
      'work': [
        {'id': 'w', 'classId': 'a', 'type': 'homework', 'title': 'Fractions', 'details': 'Page 4', 'dueDate': '2026-11-23',
          'submissions': [{'id': 's', 'studentId': 'x', 'studentNameEn': 'Ali Hassan', 'name': 'answers.pdf', 'size': 2048}]},
      ],
    });
    await tester.pumpWidget(app(ClassworkPage(
      data: data, parent: false, arabic: false, selection: null, onSelect: (_) {},
      refresh: () async {}, postWork: (_) async => true, removeWork: (_) async => true,
      submitFile: (_, _, _) async => true, openSubmission: (row) async => opened = row, linkChild: (_) async => true,
    )));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Ali Hassan'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('1 files from parents'), findsOneWidget);
    await tester.ensureVisible(find.text('Ali Hassan'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ali Hassan'));
    await tester.pump();
    expect(opened?['id'], 's');

    String? linked;
    await tester.pumpWidget(app(ClassworkPage(
      data: SchoolData({'children': <SchoolRow>[]}), parent: true, arabic: false, selection: null, onSelect: (_) {},
      refresh: () async {}, postWork: (_) async => true, removeWork: (_) async => true,
      submitFile: (_, _, _) async => true, openSubmission: (_) async {}, linkChild: (code) async {
        linked = code;
        return true;
      },
    )));
    await tester.pumpAndSettle();
    expect(find.text('Add your child'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'ABCDE-12345');
    await tester.tap(find.text('Add child'));
    await tester.pumpAndSettle();
    expect(linked, 'ABCDE-12345');
    expect(tester.takeException(), isNull);
  });
}
